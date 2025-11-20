import { initWorld, snapshotWorld, createWorldFromSnapshot, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG } from '../src/types/sim'

const world = initWorld({ ...DEFAULT_WORLD_CONFIG, maxAgents: 20, maxPlants: 6 })
const controls = { ...DEFAULT_CONTROLS }

for (let i = 0; i < 30; i++) {
  stepWorld(world, DEFAULT_WORLD_CONFIG.timeStepMs, controls)
}

const snapshot = snapshotWorld(world)
const reload = createWorldFromSnapshot(snapshot)
const snapshotReloaded = snapshotWorld(reload)

if (snapshotReloaded.agents.length !== snapshot.agents.length) {
  throw new Error('Reloaded snapshot agent count mismatch')
}
if (snapshotReloaded.plants.length !== snapshot.plants.length) {
  throw new Error('Reloaded snapshot plant count mismatch')
}

console.log('persistence snapshot test passed')
