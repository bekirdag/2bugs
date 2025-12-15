import { createWorldFromSnapshot, snapshotWorld } from '../src/ecs/world'
import { DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { interactionSystem } from '../src/ecs/systems/interactionSystem'
import { lifecycleSystem } from '../src/ecs/systems/lifecycleSystem'

const snapshot: SimulationSnapshot = {
  version: 1,
  config: { ...DEFAULT_WORLD_CONFIG, rngSeed: 42 },
  tick: 0,
  agents: [
    {
      id: 1,
      dna: {
        archetype: 'hunter',
        biome: 'land',
        familyColor: '#ff0000',
        baseSpeed: 260,
        visionRange: 260,
        hungerThreshold: 60,
        forageStartRatio: 0.7,
        eatingGreed: 0.5,
        fatCapacity: 2400,
        fatBurnThreshold: 900,
        patrolThreshold: 40,
        aggression: 0.7,
        bravery: 0.6,
        power: 90,
        defence: 60,
        fightPersistence: 0.5,
        escapeTendency: 0.4,
        escapeDuration: 2,
        lingerRate: 0.5,
        dangerRadius: 140,
        attentionSpan: 0.6,
        libidoThreshold: 0.6,
        libidoGainRate: 0.05,
        mutationRate: 0.01,
        bodyMass: 20,
        metabolism: 8,
        turnRate: 1.5,
        curiosity: 0.4,
        cohesion: 0.3,
        fear: 0.3,
        cowardice: 0.3,
        speciesFear: 0.3,
        conspecificFear: 0.2,
        sizeFear: 0.4,
        preySizeTargetRatio: 0.6,
        dependency: 0.2,
        independenceAge: 20,
        camo: 0.2,
        awareness: 0.7,
        fertility: 0.4,
        gestationCost: 10,
        moodStability: 0.6,
        preferredFood: ['prey'],
        stamina: 1,
        circadianBias: 0,
        sleepEfficiency: 0.8,
        scavengerAffinity: 0,
        senseUpkeep: 0,
        bodyPlanVersion: 1,
        bodyPlan: {
          chassis: { length: 0.6, depth: 0.6, massBias: 0.6, flexibility: 0.5, plating: 0.4 },
          senses: [{ sense: 'eye', count: 2, distribution: 'head', acuity: 0.6 }],
          limbs: [{ kind: 'leg', count: 4, size: 0.6, placement: 'mixed', gaitStyle: 0.5 }],
          appendages: [{ kind: 'tail', size: 0.5, split: 0 }],
        },
      },
      mass: 19.9,
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      energy: 9999,
      fatStore: 0,
      age: 10,
      mode: 'hunt',
      mood: { stress: 0.2, focus: 0.5, social: 0.5 },
      target: { kind: 'corpse', id: 1 },
      escapeCooldown: 0,
      gestationTimer: 0,
      injuries: 0,
      libido: 0,
      sexCooldown: 0,
    },
  ],
  plants: [],
  corpses: [
    {
      id: 1,
      position: { x: 100, y: 100 },
      radius: 40,
      nutrients: 1000,
      decay: 999,
      maxDecay: 999,
    },
  ],
  stats: { totalBirths: 0, totalDeaths: 0, mutations: 0, averageFitness: 0 },
}

const world = createWorldFromSnapshot(snapshot)
lifecycleSystem(world)

const before = snapshotWorld(world).agents[0]

interactionSystem(
  world,
  {
    killAgent: () => null,
    removePlant: () => {},
    removeCorpse: () => {},
  },
  0,
)

const after = snapshotWorld(world).agents[0]

if (!after.mass || !before.mass) throw new Error('Missing mass in snapshot')
if (!(after.mass > before.mass)) {
  throw new Error(`Expected eating to increase mass (before=${before.mass} after=${after.mass})`)
}
if (!(after.fatStore > before.fatStore)) {
  throw new Error(`Expected eating to increase fat (before=${before.fatStore} after=${after.fatStore})`)
}

console.log('interactionSystem feeding transfer test passed')

