import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { movementSystem } from '../src/ecs/systems/movementSystem'
import { lifecycleSystem } from '../src/ecs/systems/lifecycleSystem'

const baseSnapshot: SimulationSnapshot = legacyPhpToSnapshot(
  serialize(
    {
      hunter1: {
        type: 'hunter',
        x: 100,
        y: 100,
        speed: 80,
        eyesightfactor: 80,
        aggression: 80,
        threshold: 40,
        max_storage: 140,
        store_using_threshold: 70,
        danger_distance: 60,
        linger_rate: 50,
        sex_desire: 40,
        sex_threshold: 60,
      },
      prey1: {
        type: 'prey',
        x: 200,
        y: 200,
        speed: 60,
        eyesightfactor: 60,
        aggression: 20,
        threshold: 60,
      },
    },
    'utf-8',
  ),
  DEFAULT_WORLD_CONFIG,
)

const world = createWorldFromSnapshot(baseSnapshot)
const controls = { ...DEFAULT_CONTROLS }

stepWorld(world, DEFAULT_WORLD_CONFIG.timeStepMs, controls)
const after = snapshotWorld(world)

const hunter = after.agents.find((agent) => agent.dna.archetype === 'hunter')
if (!hunter) throw new Error('Hunter missing')
const prey = after.agents.find((agent) => agent.dna.archetype === 'prey')
if (!prey) throw new Error('Prey missing')

if (hunter.position.x === baseSnapshot.agents[0].position.x && hunter.position.y === baseSnapshot.agents[0].position.y) {
  throw new Error('Hunter did not move')
}
if (prey.position.x === baseSnapshot.agents[1].position.x && prey.position.y === baseSnapshot.agents[1].position.y) {
  throw new Error('Prey did not move')
}

console.log('movementSystem smoke test passed')

// Fat penalty sanity: same agent, higher fat => less movement distance (with deterministic RNG seed).
{
  const base = legacyPhpToSnapshot(
    serialize(
      {
        prey1: {
          type: 'prey',
          x: 250,
          y: 250,
          speed: 60,
          eyesightfactor: 60,
          aggression: 20,
          threshold: 60,
          max_storage: 200,
          store_using_threshold: 70,
        },
      },
      'utf-8',
    ),
    { ...DEFAULT_WORLD_CONFIG, rngSeed: 123 },
  )

  const makeWorld = (fatStore: number) => {
    const snapshot: SimulationSnapshot = {
      ...base,
      agents: base.agents.map((agent) => ({
        ...agent,
        energy: 9999,
        fatStore,
        heading: 0,
        velocity: { x: 0, y: 0 },
        mode: 'patrol',
        target: null,
      })),
    }
    const w = createWorldFromSnapshot(snapshot)
    lifecycleSystem(w)
    // Use a fixed dt and skip other systems to isolate speed.
    movementSystem(w, DEFAULT_WORLD_CONFIG.timeStepMs / 1000, 1, 0, 1)
    return snapshotWorld(w).agents[0]
  }

  const lean = makeWorld(0)
  const fat = makeWorld(200)

  const leanDx = lean.position.x - base.agents[0].position.x
  const leanDy = lean.position.y - base.agents[0].position.y
  const fatDx = fat.position.x - base.agents[0].position.x
  const fatDy = fat.position.y - base.agents[0].position.y

  const leanDist = Math.sqrt(leanDx * leanDx + leanDy * leanDy)
  const fatDist = Math.sqrt(fatDx * fatDx + fatDy * fatDy)

  if (!(fatDist < leanDist)) {
    throw new Error(`Expected fat agent to move less (lean=${leanDist.toFixed(3)} fat=${fatDist.toFixed(3)})`)
  }
}

console.log('fat speed penalty sanity test passed')

// Land locomotion requires legs: legCount=0 => no movement.
{
  const base = legacyPhpToSnapshot(
    serialize(
      {
        prey1: {
          type: 'prey',
          x: 250,
          y: 250,
          speed: 60,
          eyesightfactor: 60,
          aggression: 20,
          threshold: 60,
          max_storage: 200,
          store_using_threshold: 70,
        },
      },
      'utf-8',
    ),
    { ...DEFAULT_WORLD_CONFIG, rngSeed: 456 },
  )

  const snapshot: SimulationSnapshot = {
    ...base,
    agents: base.agents.map((agent) => ({
      ...agent,
      energy: 9999,
      fatStore: 0,
      heading: 0,
      velocity: { x: 0, y: 0 },
      mode: 'patrol',
      target: null,
      dna: {
        ...agent.dna,
        biome: 'land',
        bodyPlanVersion: 2,
        bodyPlan: {
          ...agent.dna.bodyPlan,
          limbs: [],
        },
      },
    })),
  }

  const w = createWorldFromSnapshot(snapshot)
  lifecycleSystem(w)
  const before = snapshotWorld(w).agents[0]!
  for (let i = 0; i < 20; i++) {
    movementSystem(w, DEFAULT_WORLD_CONFIG.timeStepMs / 1000, 1, 0, 1)
  }
  const after = snapshotWorld(w).agents[0]!
  if (after.position.x !== before.position.x || after.position.y !== before.position.y) {
    throw new Error(`Expected legless land animal to not move, got dx=${after.position.x - before.position.x} dy=${after.position.y - before.position.y}`)
  }
}

console.log('legless land locomotion test passed')
