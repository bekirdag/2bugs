import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'

const config = { ...DEFAULT_WORLD_CONFIG, rngSeed: 1 }

const base = legacyPhpToSnapshot(
  serialize(
    {
      hunter1: { type: 'hunter', x: 100, y: 100, sex_desire: 95, sex_threshold: 10, energy: 90, age: 2 },
      hunter2: { type: 'hunter', x: 108, y: 110, sex_desire: 95, sex_threshold: 10, energy: 90, age: 2 },
      // Keep other archetypes far away so hunters aren't distracted from mating.
      prey3: { type: 'prey', x: 5000, y: 5000, energy: 90 },
    },
    'utf-8',
  ),
  config,
)

// Add a scavenger so `enforcePopulationTargets` doesn't auto-refill extinct archetypes.
const hunterDNA = base.agents.find((a) => a.dna.archetype === 'hunter')?.dna
if (!hunterDNA) throw new Error('Missing hunter DNA')
const snapshot = {
  ...base,
  agents: [
    ...base.agents.map((agent) =>
      agent.dna.archetype === 'hunter'
        ? { ...agent, dna: { ...agent.dna, maturityAgeYears: 1 } }
        : agent,
    ),
    {
      id: 999,
      dna: {
        ...hunterDNA,
        archetype: 'scavenger',
        familyColor: '#8b5a2b',
        preferredFood: [],
        scavengerAffinity: 1,
        maturityAgeYears: 1,
      },
      mass: hunterDNA.bodyMass,
      position: { x: 7000, y: 7000 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      energy: 90,
      fatStore: hunterDNA.fatCapacity * 0.3,
      age: 5,
      mode: 'patrol',
      mood: { stress: 0.2, focus: 0.5, social: 0.5 },
      target: null,
      escapeCooldown: 0,
      gestationTimer: 0,
      injuries: 0,
      libido: 0,
      sexCooldown: 0,
      mutationMask: 0,
    },
  ],
}
const world = createWorldFromSnapshot(snapshot)
const controls = { ...DEFAULT_CONTROLS, maxAgents: 10, mutationRate: 1, speed: 0 }

for (let i = 0; i < 650; i++) {
  stepWorld(world, DEFAULT_WORLD_CONFIG.timeStepMs, controls)
}

const after = snapshotWorld(world)
if (after.agents.length <= snapshot.agents.length) {
  throw new Error('Reproduction did not create new agents')
}
if (after.stats.mutations <= snapshot.stats.mutations) {
  throw new Error('Mutation counter did not increase')
}

console.log('reproduction system smoke test passed')
