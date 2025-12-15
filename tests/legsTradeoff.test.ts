import { createWorldFromSnapshot, snapshotWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { lifecycleSystem } from '../src/ecs/systems/lifecycleSystem'
import { movementSystem } from '../src/ecs/systems/movementSystem'
import { metabolismSystem } from '../src/ecs/systems/metabolismSystem'
import { DNA, Energy, Velocity } from '../src/ecs/components'
import { createBaseBodyPlan } from '../src/ecs/bodyPlan'

function makeSnapshot(legCount: number): SimulationSnapshot {
  const base = legacyPhpToSnapshot(
    serialize(
      {
        prey1: {
          type: 'prey',
          x: 250,
          y: 250,
          speed: 80,
          eyesightfactor: 60,
          aggression: 20,
          threshold: 60,
          max_storage: 200,
          store_using_threshold: 70,
        },
      },
      'utf-8',
    ),
    { ...DEFAULT_WORLD_CONFIG, rngSeed: 777, bounds: { x: 2000, y: 2000 } },
  )

  const plantId = 1
  const plan = createBaseBodyPlan('prey', 'land')
  plan.limbs = plan.limbs.map((limb) => {
    if (limb.kind !== 'leg') return limb
    return { ...limb, count: legCount, size: 0.55, gaitStyle: 0.5, placement: 'mixed', layout: undefined }
  })

  return {
    ...base,
    plants: [
      {
        id: plantId,
        dna: {
          biomass: 1,
          regrowthRate: 1,
          seedSpread: 1,
          pigment: '#00ff00',
          nutrientDensity: 1,
          thorns: 0,
          seasonPreference: 0,
        },
        position: { x: 1250, y: 250 },
        size: 1,
        moisture: 1,
      },
    ],
    agents: base.agents.map((agent) => ({
      ...agent,
      energy: 9999,
      fatStore: 0,
      mass: 1,
      heading: 0,
      velocity: { x: 0, y: 0 },
      mode: 'hunt',
      target: { kind: 'plant', id: plantId },
      dna: {
        ...agent.dna,
        biome: 'land',
        bodyPlanVersion: 2,
        bodyPlan: plan,
      },
    })),
  }
}

// More legs should generally move faster (land locomotion stats scale with leg count).
{
  const fewLegs = createWorldFromSnapshot(makeSnapshot(2))
  const manyLegs = createWorldFromSnapshot(makeSnapshot(8))
  lifecycleSystem(fewLegs)
  lifecycleSystem(manyLegs)

  const idA = snapshotWorld(fewLegs).agents[0]!.id
  const idB = snapshotWorld(manyLegs).agents[0]!.id
  const entityA = fewLegs.agents.get(idA)
  const entityB = manyLegs.agents.get(idB)
  if (entityA === undefined || entityB === undefined) throw new Error('Missing entities')

  const dt = DEFAULT_WORLD_CONFIG.timeStepMs / 1000
  for (let i = 0; i < 120; i++) {
    movementSystem(fewLegs, dt, 1, 0, DEFAULT_CONTROLS.fatSpeedPenalty, DEFAULT_CONTROLS)
    movementSystem(manyLegs, dt, 1, 0, DEFAULT_CONTROLS.fatSpeedPenalty, DEFAULT_CONTROLS)
  }

  const afterA = snapshotWorld(fewLegs).agents[0]!
  const afterB = snapshotWorld(manyLegs).agents[0]!
  const dxA = afterA.position.x - 250
  const dxB = afterB.position.x - 250
  if (!(dxB > dxA * 1.02 && dxB - dxA > 25)) {
    throw new Error(`Expected 8-leg animal to move faster (dx2=${dxA.toFixed(2)} dx8=${dxB.toFixed(2)})`)
  }
}

console.log('legs speed scaling test passed')

// More legs should cost more upkeep (morphology drain is proportional to land legCount).
{
  const w2 = createWorldFromSnapshot(makeSnapshot(2))
  const w8 = createWorldFromSnapshot(makeSnapshot(8))
  lifecycleSystem(w2)
  lifecycleSystem(w8)

  const id2 = snapshotWorld(w2).agents[0]!.id
  const id8 = snapshotWorld(w8).agents[0]!.id
  const e2 = w2.agents.get(id2)
  const e8 = w8.agents.get(id8)
  if (e2 === undefined || e8 === undefined) throw new Error('Missing entities')

  // Suppress other drains so morphology dominates.
  DNA.metabolism[e2] = 0
  DNA.metabolism[e8] = 0
  DNA.senseUpkeep[e2] = 0
  DNA.senseUpkeep[e8] = 0
  Velocity.x[e2] = 0
  Velocity.y[e2] = 0
  Velocity.x[e8] = 0
  Velocity.y[e8] = 0
  Energy.fatStore[e2] = 0
  Energy.fatStore[e8] = 0
  Energy.value[e2] = 1000
  Energy.value[e8] = 1000

  const controls = { ...DEFAULT_CONTROLS, speed: 1, senseUpkeepScale: 0, morphologyUpkeepScale: 1 }
  metabolismSystem(w2, 1, controls)
  metabolismSystem(w8, 1, controls)
  const drain2 = 1000 - Energy.value[e2]
  const drain8 = 1000 - Energy.value[e8]
  if (!(drain8 > drain2 * 1.7)) {
    throw new Error(`Expected 8-leg animal to have higher morphology upkeep (2=${drain2.toFixed(6)} 8=${drain8.toFixed(6)})`)
  }
}

console.log('legs upkeep scaling test passed')
