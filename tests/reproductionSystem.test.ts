import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'

const snapshot = legacyPhpToSnapshot(
  serialize(
    {
      hunter1: { type: 'hunter', x: 100, y: 100, sex_desire: 95, sex_threshold: 10, energy: 90 },
      hunter2: { type: 'hunter', x: 108, y: 110, sex_desire: 95, sex_threshold: 10, energy: 90 },
    },
    'utf-8',
  ),
  DEFAULT_WORLD_CONFIG,
)
const world = createWorldFromSnapshot(snapshot)
const controls = { ...DEFAULT_CONTROLS, maxAgents: 12, mutationRate: 1 }

for (let i = 0; i < 40; i++) {
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
