import { createWorld, removeEntity } from 'bitecs'

import { DNA, Energy, Position } from './components'
import { createRegistry, serializeAgentEntity, serializePlantEntity, spawnAgentEntity, spawnPlantEntity } from './registry'
import type { SimulationContext } from './types'
import { perceptionSystem } from './systems/perceptionSystem'
import { movementSystem } from './systems/movementSystem'
import { interactionSystem } from './systems/interactionSystem'
import { metabolismSystem } from './systems/metabolismSystem'
import { plantGrowthSystem } from './systems/plantSystem'
import { reproductionSystem } from './systems/reproductionSystem'
import { flockingSystem } from './systems/flockingSystem'
import { circadianSystem } from './systems/circadianSystem'
import { scavengerSystem } from './systems/scavengerSystem'
import { grazingSystem } from './systems/grazingSystem'

import type {
  AgentState,
  Archetype,
  ControlState,
  DNA,
  Vector2,
  PlantDNA,
  PlantState,
  SimulationSnapshot,
  WorldConfig,
} from '@/types/sim'
import { SNAPSHOT_VERSION } from '@/types/sim'
import { SpatialHash } from '@/utils/spatialHash'
import { mulberry32, randItem, randRange } from '@/utils/rand'
import { BODY_PLAN_VERSION, cloneBodyPlan, createBaseBodyPlan, prepareDNA } from '@/ecs/bodyPlan'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function createContext(config: WorldConfig): SimulationContext {
  const world = createWorld()
  const rng = mulberry32(config.rngSeed)
  const registry = createRegistry(world)
  return {
    world,
    registry,
    config,
    tick: 0,
    rng,
    agents: new Map(),
    plants: new Map(),
    genomes: new Map(),
    agentIndex: new SpatialHash<number>(config.spatialHashCellSize),
    plantIndex: new SpatialHash<number>(config.spatialHashCellSize),
    nextAgentId: 1,
    nextPlantId: 1,
    metrics: { births: 0, deaths: 0, mutations: 0 },
    lootSites: [],
  }
}

function cloneConfig(config: WorldConfig): WorldConfig {
  return {
    ...config,
    bounds: { ...config.bounds },
  }
}

export function initWorld(config: WorldConfig): SimulationContext {
  const ctx = createContext(cloneConfig(config))
  spawnInitialPopulation(ctx)
  return ctx
}

export function createWorldFromSnapshot(snapshot: SimulationSnapshot): SimulationContext {
  const ctx = initWorld(snapshot.config)
  ctx.world = createWorld()
  ctx.registry = createRegistry(ctx.world)
  ctx.agents.clear()
  ctx.plants.clear()
  ctx.genomes.clear()
  ctx.nextAgentId = 1
  ctx.nextPlantId = 1

  snapshot.agents.forEach((agent) => {
    const preparedDNA = prepareDNA(agent.dna)
    const entity = spawnAgentEntity(ctx.registry, { ...agent, dna: preparedDNA })
    ctx.agents.set(agent.id, entity)
    ctx.genomes.set(agent.id, {
      ...preparedDNA,
      bodyPlan: cloneBodyPlan(preparedDNA.bodyPlan),
    })
    ctx.agentIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id: agent.id, data: agent.id })
  })
  snapshot.plants.forEach((plant) => {
    const entity = spawnPlantEntity(ctx.registry, plant)
    ctx.plants.set(plant.id, entity)
    ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id: plant.id, data: plant.id })
  })

  ctx.nextAgentId = Math.max(...snapshot.agents.map((a) => a.id), 0) + 1
  ctx.nextPlantId = Math.max(...snapshot.plants.map((p) => p.id), 0) + 1
  ctx.metrics = {
    births: snapshot.stats.totalBirths,
    deaths: snapshot.stats.totalDeaths,
    mutations: snapshot.stats.mutations,
  }

  return ctx
}

function spawnInitialPopulation(ctx: SimulationContext) {
  const hunters = Math.max(6, Math.floor(ctx.config.maxAgents * 0.35))
  const prey = Math.max(10, ctx.config.maxAgents - hunters)
  const plants = ctx.config.maxPlants

  for (let i = 0; i < hunters; i++) {
    spawnAgent(ctx, 'hunter')
  }
  for (let i = 0; i < prey; i++) {
    spawnAgent(ctx, 'prey')
  }
  for (let i = 0; i < plants; i++) {
    spawnPlant(ctx)
  }
}

export function stepWorld(ctx: SimulationContext, dtMs: number, controls: ControlState): Record<string, number> {
  const dt = dtMs / 1000
  const timings: Record<string, number> = {}
  const measure = <T>(label: string, fn: () => T): T => {
    const start = now()
    const result = fn()
    timings[label] = (timings[label] ?? 0) + (now() - start)
    return result
  }

  measure('perception', () => perceptionSystem(ctx, controls))
  measure('flocking', () => flockingSystem(ctx, dt, controls.flockingStrength ?? 1))
  measure('grazing', () => grazingSystem(ctx, controls.curiosityBias ?? 0))
  measure('circadian', () => circadianSystem(ctx, dt))
  measure('movement', () => movementSystem(ctx, dt, controls.speed, controls.curiosityBias ?? 0))
  measure('interaction', () =>
    interactionSystem(
      ctx,
      {
        removeAgent: (id) => removeAgent(ctx, id),
        removePlant: (id) => removePlant(ctx, id),
      },
      controls.aggressionBias ?? 0,
    ),
  )
  measure('scavenger', () => scavengerSystem(ctx, dt))
  const expired = measure('metabolism', () => metabolismSystem(ctx, dt, controls))
  measure('expire', () => expireAgents(ctx, expired))
  measure('plantGrowth', () => plantGrowthSystem(ctx, dt))
  measure('reproduction', () =>
    reproductionSystem(
      ctx,
      controls,
      {
        spawnOffspring: (dna, position, options) =>
          spawnAgent(ctx, dna.archetype, dna, position, options?.mutationMask ?? 0),
      },
      dt,
    ),
  )
  measure('population', () => enforcePopulationTargets(ctx, controls))

  ctx.tick++
  return timings
}

export function snapshotWorld(ctx: SimulationContext): SimulationSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    config: cloneConfig(ctx.config),
    tick: ctx.tick,
    agents: Array.from(ctx.agents.entries()).map(([id, entity]) =>
      serializeAgentEntity(entity, ctx.genomes.get(id)),
    ),
    plants: Array.from(ctx.plants.entries()).map(([id, entity]) => serializePlantEntity(entity, id)),
    stats: {
      totalBirths: ctx.metrics.births,
      totalDeaths: ctx.metrics.deaths,
      mutations: ctx.metrics.mutations,
      averageFitness: calculateAverageFitness(ctx),
    },
  }
}

function spawnAgent(
  ctx: SimulationContext,
  archetype: Archetype,
  dnaOverride?: DNA,
  positionOverride?: Vector2,
  mutationMask = 0,
) {
  const dna = prepareDNA(dnaOverride ?? buildDNA(ctx, archetype))
  const id = ctx.nextAgentId++
  const state: AgentState = {
    id,
    dna,
    position: {
      x: positionOverride?.x ?? randRange(ctx.rng, 0, ctx.config.bounds.x),
      y: positionOverride?.y ?? randRange(ctx.rng, 0, ctx.config.bounds.y),
    },
    velocity: { x: 0, y: 0 },
    heading: randRange(ctx.rng, 0, Math.PI * 2),
    energy: dna.hungerThreshold * 1.2,
    fatStore: dna.fatCapacity * 0.4,
    age: 0,
    mode: 'patrol',
    mood: { stress: 0.25, focus: 0.5, social: 0.5 },
    escapeCooldown: 0,
    gestationTimer: 0,
    injuries: 0,
    target: null,
    libido: 0,
    sexCooldown: 0,
    mutationMask,
  }
  const entity = spawnAgentEntity(ctx.registry, state)
  ctx.agents.set(id, entity)
  ctx.genomes.set(id, {
    ...dna,
    bodyPlan: cloneBodyPlan(dna.bodyPlan),
  })
  ctx.agentIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  ctx.metrics.births++
  return entity
}

function spawnPlant(ctx: SimulationContext) {
  const id = ctx.nextPlantId++
  const dna: PlantDNA = {
    biomass: randRange(ctx.rng, 0.8, 1.2),
    regrowthRate: randRange(ctx.rng, 0.3, 0.7),
    seedSpread: randRange(ctx.rng, 0.2, 0.8),
    pigment: randItem(ctx.rng, ['#2ab811', '#3dad2a', '#7fe52f']),
    nutrientDensity: randRange(ctx.rng, 0.4, 1),
    thorns: randRange(ctx.rng, 0, 0.5),
    seasonPreference: randRange(ctx.rng, -1, 1),
  }

  const plant: PlantState = {
    id,
    dna,
    position: {
      x: randRange(ctx.rng, 0, ctx.config.bounds.x),
      y: randRange(ctx.rng, 0, ctx.config.bounds.y),
    },
    size: dna.biomass,
    moisture: randRange(ctx.rng, 0.4, 1),
  }

  const entity = spawnPlantEntity(ctx.registry, plant)
  ctx.plants.set(id, entity)
  ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
}

function expireAgents(ctx: SimulationContext, ids: number[]) {
  ids.forEach((id) => removeAgent(ctx, id))
}

function enforcePopulationTargets(ctx: SimulationContext, controls: ControlState) {
  const deficit = controls.maxAgents - ctx.agents.size
  if (deficit > 0) {
    for (let i = 0; i < deficit; i++) {
      const archetype = ctx.rng() > 0.35 ? 'prey' : 'hunter'
      const entity = spawnAgent(ctx, archetype)
      DNA.mutationRate[entity] = controls.mutationRate
    }
  }

  const plantDeficit = controls.maxPlants - ctx.plants.size
  if (plantDeficit > 0) {
    for (let i = 0; i < plantDeficit; i++) {
      spawnPlant(ctx)
    }
  }
}

function removePlant(ctx: SimulationContext, id: number) {
  const entity = ctx.plants.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.plants.delete(id)
  ctx.plantIndex.delete(id)
}

function removeAgent(ctx: SimulationContext, id: number) {
  const entity = ctx.agents.get(id)
  if (entity === undefined) return
  removeEntity(ctx.world, entity)
  ctx.agents.delete(id)
  ctx.agentIndex.delete(id)
  ctx.genomes.delete(id)
  ctx.metrics.deaths++
}

function buildDNA(ctx: SimulationContext, archetype: Archetype): DNA {
  const speedBase = archetype === 'hunter' ? randRange(ctx.rng, 320, 420) : randRange(ctx.rng, 180, 260)
  const vision = archetype === 'hunter' ? randRange(ctx.rng, 260, 360) : randRange(ctx.rng, 180, 280)
  const hungerThreshold = archetype === 'hunter' ? randRange(ctx.rng, 60, 90) : randRange(ctx.rng, 40, 70)
  const biome = 'land'
  const bodyPlan = createBaseBodyPlan(archetype, biome)

  return {
    archetype,
    biome,
    familyColor: archetype === 'hunter' ? '#f97316' : '#22d3ee',
    baseSpeed: speedBase,
    visionRange: vision,
    hungerThreshold,
    fatCapacity: randRange(ctx.rng, 120, 200),
    fatBurnThreshold: randRange(ctx.rng, 40, 70),
    patrolThreshold: randRange(ctx.rng, 0.4, 0.9) * hungerThreshold,
    aggression: randRange(ctx.rng, archetype === 'hunter' ? 0.6 : 0.2, archetype === 'hunter' ? 1 : 0.6),
    bravery: randRange(ctx.rng, 0.4, 1),
    power: randRange(ctx.rng, archetype === 'hunter' ? 80 : 30, archetype === 'hunter' ? 140 : 70),
    defence: randRange(ctx.rng, 40, 110),
    fightPersistence: randRange(ctx.rng, 0.2, 0.8),
    escapeTendency: randRange(ctx.rng, 0.3, 0.9),
    escapeDuration: randRange(ctx.rng, 1, 4),
    lingerRate: randRange(ctx.rng, 0.2, 0.9),
    dangerRadius: randRange(ctx.rng, 120, 240),
    attentionSpan: randRange(ctx.rng, 0.35, 0.9),
    libidoThreshold: randRange(ctx.rng, 0.4, 0.8),
    libidoGainRate: randRange(ctx.rng, 0.01, 0.05),
    mutationRate: ctx.config.timeStepMs / 1000 / 100,
    bodyMass: randRange(ctx.rng, archetype === 'hunter' ? 1.2 : 0.8, archetype === 'hunter' ? 2 : 1.4),
    metabolism: randRange(ctx.rng, 6, 12),
    turnRate: randRange(ctx.rng, 1, 3),
    curiosity: randRange(ctx.rng, 0.3, 0.9),
    cohesion: randRange(ctx.rng, 0.2, 0.8),
    fear: randRange(ctx.rng, 0.2, 0.8),
    camo: randRange(ctx.rng, 0.1, 0.7),
    awareness: randRange(ctx.rng, 0.5, 1),
    fertility: randRange(ctx.rng, 0.25, 0.8),
    gestationCost: randRange(ctx.rng, 5, 20),
    moodStability: randRange(ctx.rng, 0.2, 0.9),
    preferredFood:
      archetype === 'hunter'
        ? ['prey']
        : randRange(ctx.rng, 0, 1) > 0.8
          ? ['plant', 'scavenger']
          : ['plant'],
    stamina: randRange(ctx.rng, 0.7, 1.4),
    circadianBias:
      archetype === 'hunter' ? randRange(ctx.rng, 0.2, 0.8) : randRange(ctx.rng, -0.8, 0.4),
    sleepEfficiency: randRange(ctx.rng, 0.5, 1),
    scavengerAffinity: randRange(ctx.rng, archetype === 'hunter' ? 0.1 : 0, archetype === 'hunter' ? 0.6 : 0.4),
    senseUpkeep: 0,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan,
  }
}

function calculateAverageFitness(ctx: SimulationContext) {
  if (ctx.agents.size === 0) return 0
  let sum = 0
  ctx.agents.forEach((entity) => {
    const energyScore = Energy.value[entity] / Math.max(DNA.baseSpeed[entity], 1)
    const fatScore = Energy.fatStore[entity] / Math.max(Energy.fatCapacity[entity], 1)
    sum += (energyScore + fatScore) / 2
  })
  return sum / ctx.agents.size
}
