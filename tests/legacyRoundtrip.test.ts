import assert from 'node:assert/strict'
import { serialize } from 'php-serialize'

import { legacyPhpToSnapshot, snapshotToLegacyPhp } from '../src/utils/legacyAdapter'
import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type ControlState, type WorldConfig } from '../src/types/sim'

type LegacyCreature = Record<string, unknown>

const legacyWorld = buildLegacyFixture()
const serialized = serialize(legacyWorld, 'utf-8')

const testConfig: WorldConfig = {
  ...DEFAULT_WORLD_CONFIG,
  bounds: { ...DEFAULT_WORLD_CONFIG.bounds },
  rngSeed: 1337,
  maxAgents: Object.keys(legacyWorld).length,
  maxPlants: 0,
}

const snapshot = legacyPhpToSnapshot(serialized, testConfig)
assert.equal(snapshot.agents.length, Object.keys(legacyWorld).length, 'import should create agents')

const world = createWorldFromSnapshot(snapshot)
const controls: ControlState = {
  ...DEFAULT_CONTROLS,
  paused: false,
  maxAgents: snapshot.agents.length,
  maxPlants: 0,
}

for (let i = 0; i < 5; i++) {
  stepWorld(world, snapshot.config.timeStepMs, controls)
}

const updatedSnapshot = snapshotWorld(world)
updatedSnapshot.agents.forEach((agent) => {
  Object.entries(agent.dna).forEach(([key, value]) => {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `DNA field ${key} is invalid`)
    }
  })
  assert.ok(Number.isFinite(agent.position.x) && Number.isFinite(agent.position.y), 'Agent position invalid')
  assert.ok(Number.isFinite(agent.energy), 'Agent energy invalid')
})
const exportString = snapshotToLegacyPhp(updatedSnapshot)
assert.ok(exportString.length > 0, 'snapshot export should produce legacy payload')

const reimported = legacyPhpToSnapshot(exportString, {
  ...updatedSnapshot.config,
  bounds: { ...updatedSnapshot.config.bounds },
})
const expectedAgents = updatedSnapshot.agents.filter(
  (agent) => agent.dna.archetype === 'hunter' || agent.dna.archetype === 'prey',
)
assert.equal(reimported.agents.length, expectedAgents.length, 'round-trip should keep hunter/prey count')
assert.ok(
  reimported.agents.every((agent) => Number.isFinite(agent.position.x) && Number.isFinite(agent.energy)),
  'reloaded agents should have finite state',
)

console.log('Legacy round-trip smoke test passed')

function buildLegacyFixture(): Record<string, LegacyCreature> {
  return {
    hunter101: legacyCreature({
      id: 'hunter101',
      type: 'hunter',
      x: 320,
      y: 180,
      color: '#7c2d15',
      energy: 75,
      store: 40,
      store_using_threshold: 90,
      speed: 78,
      eyesightfactor: 70,
      aggression: 66,
      fight_rate: 70,
      escape_rate: 34,
      danger_time: 3,
      danger_time_long: 7,
      patrolset: 'true',
      patrolx: 400,
      patroly: 220,
      fight_energy_rate: 35,
      mutation_rate: 0.015,
    }),
    prey205: legacyCreature({
      id: 'prey205',
      type: 'prey',
      x: 640,
      y: 360,
      color: '#22d3ee',
      energy: 55,
      store: 30,
      store_using_threshold: 60,
      speed: 60,
      eyesightfactor: 58,
      aggression: 22,
      fight_rate: 30,
      escape_rate: 70,
      danger_time: 2,
      danger_time_long: 6,
      fight_energy_rate: 55,
      mutation_rate: 0.01,
    }),
  }
}

function legacyCreature(overrides: LegacyCreature): LegacyCreature {
  const base: LegacyCreature = {
    x: 120,
    y: 80,
    width: 10,
    height: 10,
    r: 10,
    fill: '#ffffff',
    mode: 'sleep',
    id: 'agent0',
    age: 12,
    type: 'hunter',
    color: '#ffffff',
    sex_desire: 25,
    sex_threshold: 60,
    store: 20,
    store_using_threshold: 80,
    gender: 'm',
    danger_distance: 40,
    linger_rate: 30,
    threshold: 60,
    speed: 50,
    eyesightfactor: 50,
    class: 'org #ffffff',
    family: '#ffffff',
    energy: 60,
    danger_time: 2,
    danger_time_long: 4,
    patrolx: 0,
    patroly: 0,
    patrolset: 'false',
    patrol_threshold: 40,
    max_storage: 140,
    power: 65,
    defence: 45,
    fight_energy_rate: 45,
    escape_rate: 40,
    fight_rate: 50,
    escape_long: 3,
    escape_time: 0,
    aggression: 50,
    mutation_rate: 0.02,
  }
  return { ...base, ...overrides }
}
