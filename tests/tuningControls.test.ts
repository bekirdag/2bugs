import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { metabolismSystem } from '../src/ecs/systems/metabolismSystem'
import { DNA, Energy, Velocity } from '../src/ecs/components'

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
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 4242 },
)

function measureEnergyDrain(
  patchControls: Partial<typeof DEFAULT_CONTROLS>,
  configureEntity: (snapshot: SimulationSnapshot, entity: number) => void,
) {
  const snapshot: SimulationSnapshot = {
    ...base,
    agents: base.agents.map((agent) => ({
      ...agent,
      energy: 1000,
      fatStore: 0,
      velocity: { x: 0, y: 0 },
      mode: 'patrol',
      target: null,
    })),
  }
  const world = createWorldFromSnapshot(snapshot)
  const id = snapshot.agents[0]!.id
  const entity = world.agents.get(id)
  if (entity === undefined) throw new Error('Missing entity')

  configureEntity(snapshot, entity)

  const controls = { ...DEFAULT_CONTROLS, ...patchControls }
  const before = Energy.value[entity]
  metabolismSystem(world, 1, controls)
  const after = Energy.value[entity]
  return before - after
}

// Sense upkeep scaling should proportionally change drain when other drains are suppressed.
{
  const baseDrain = measureEnergyDrain(
    { senseUpkeepScale: 1, morphologyUpkeepScale: 0, speed: 1 },
    (_snapshot, entity) => {
      DNA.metabolism[entity] = 0
      DNA.senseUpkeep[entity] = 10
      Velocity.x[entity] = 0
      Velocity.y[entity] = 0
    },
  )

  const doubleDrain = measureEnergyDrain(
    { senseUpkeepScale: 2, morphologyUpkeepScale: 0, speed: 1 },
    (_snapshot, entity) => {
      DNA.metabolism[entity] = 0
      DNA.senseUpkeep[entity] = 10
      Velocity.x[entity] = 0
      Velocity.y[entity] = 0
    },
  )

  if (!(doubleDrain > baseDrain * 1.8)) {
    throw new Error(
      `Expected senseUpkeepScale=2 to increase drain (~2x), got base=${baseDrain.toFixed(6)} double=${doubleDrain.toFixed(6)}`,
    )
  }
}

console.log('tuning: sense upkeep scale test passed')

// Morphology upkeep scaling should proportionally change drain when other drains are suppressed.
{
  const baseDrain = measureEnergyDrain(
    { senseUpkeepScale: 0, morphologyUpkeepScale: 1, speed: 1 },
    (_snapshot, entity) => {
      DNA.metabolism[entity] = 0
      DNA.senseUpkeep[entity] = 0
      Velocity.x[entity] = 0
      Velocity.y[entity] = 0
    },
  )

  const doubleDrain = measureEnergyDrain(
    { senseUpkeepScale: 0, morphologyUpkeepScale: 2, speed: 1 },
    (_snapshot, entity) => {
      DNA.metabolism[entity] = 0
      DNA.senseUpkeep[entity] = 0
      Velocity.x[entity] = 0
      Velocity.y[entity] = 0
    },
  )

  if (!(baseDrain > 0)) {
    throw new Error(`Expected non-zero morphology drain baseline, got ${baseDrain.toFixed(6)}`)
  }
  if (!(doubleDrain > baseDrain * 1.8)) {
    throw new Error(
      `Expected morphologyUpkeepScale=2 to increase drain (~2x), got base=${baseDrain.toFixed(6)} double=${doubleDrain.toFixed(6)}`,
    )
  }
}

console.log('tuning: morphology upkeep scale test passed')

