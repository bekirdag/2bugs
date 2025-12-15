import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { movementSystem } from '../src/ecs/systems/movementSystem'
import { lifecycleSystem } from '../src/ecs/systems/lifecycleSystem'
import { Position, Velocity } from '../src/ecs/components'

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
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 999 },
)

const plantId = 1
const snapshot: SimulationSnapshot = {
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
    heading: 0,
    velocity: { x: 0, y: 0 },
    mode: 'hunt',
    target: { kind: 'plant', id: plantId },
  })),
}

const world = createWorldFromSnapshot(snapshot)
lifecycleSystem(world)

const id = snapshot.agents[0]!.id
const entity = world.agents.get(id)
if (entity === undefined) throw new Error('Missing entity')

const dt = DEFAULT_WORLD_CONFIG.timeStepMs / 1000
const speeds: number[] = []
for (let i = 0; i < 60; i++) {
  movementSystem(world, dt, 1, 0, 1)
  speeds.push(Math.abs(Velocity.x[entity]))
}

const min = Math.min(...speeds)
const max = Math.max(...speeds)
if (!(max - min > 0.5)) {
  throw new Error(`Expected gait-pulsed velocity variation, got min=${min.toFixed(3)} max=${max.toFixed(3)}`)
}

// Should still generally progress toward the target.
const dx = Position.x[entity] - snapshot.agents[0]!.position.x
if (!(dx > 0)) {
  throw new Error(`Expected agent to move forward, got dx=${dx}`)
}

console.log('gait pulse locomotion test passed')

