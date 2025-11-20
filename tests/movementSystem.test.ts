import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'

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
