import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { lifecycleSystem } from '../src/ecs/systems/lifecycleSystem'
import { movementSystem } from '../src/ecs/systems/movementSystem'
import { spawnRockEntity } from '../src/ecs/registry'
import { Heading, Obstacle, Position } from '../src/ecs/components'

const base = legacyPhpToSnapshot(
  serialize(
    {
      prey1: {
        type: 'prey',
        x: 100,
        y: 100,
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
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 123, bounds: { x: 2000, y: 2000 } },
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
      position: { x: 300, y: 100 },
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
// Remove generated rocks for determinism, then add a single blocking rock.
world.rocks.clear()
const rockEntity = spawnRockEntity(world.registry, { position: { x: 200, y: 100 }, radius: 42 })
world.rocks.set(1, rockEntity)

lifecycleSystem(world)

const id = snapshot.agents[0]!.id
const entity = world.agents.get(id)
if (entity === undefined) throw new Error('Missing entity')

// Rock avoidance should steer away from straight-line path quickly (may take a few ticks with angular inertia).
let heading = Heading.angle[entity]
let steered = false
for (let i = 0; i < 10; i++) {
  movementSystem(world, DEFAULT_WORLD_CONFIG.timeStepMs / 1000, 1, 0, DEFAULT_CONTROLS.fatSpeedPenalty)
  heading = Heading.angle[entity]
  if (Math.abs(heading) >= 0.015) {
    steered = true
    break
  }
}
if (!steered) {
  throw new Error(`Expected rock-aware pathing to steer quickly, got heading=${heading}`)
}

// After a short run, agent should have deviated in Y and not be inside the rock.
for (let i = 0; i < 40; i++) {
  movementSystem(world, DEFAULT_WORLD_CONFIG.timeStepMs / 1000, 1, 0, DEFAULT_CONTROLS.fatSpeedPenalty)
}

const dx = Position.x[entity] - 200
const dy = Position.y[entity] - 100
const dist = Math.sqrt(dx * dx + dy * dy)
const min = (Obstacle.radius[rockEntity] || 0) + 16
if (!(dist >= min)) {
  throw new Error(`Expected agent to not be inside rock after pathing, got dist=${dist} min=${min}`)
}
if (Math.abs(Position.y[entity] - 100) < 4) {
  throw new Error('Expected agent to go around rock (change y), but y stayed nearly constant')
}

console.log('rock-aware pathing test passed')
