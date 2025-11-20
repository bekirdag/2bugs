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
  DNA as DNAState,
  Biome,
  Vector2,
  PlantDNA,
  PlantState,
  SimulationSnapshot,
  WorldConfig,
} from '@/types/sim'
import { SNAPSHOT_VERSION } from '@/types/sim'
import { SpatialHash } from '@/utils/spatialHash'
import { mulberry32, randItem, randRange, jitter } from '@/utils/rand'
import {
  BODY_PLAN_VERSION,
  cloneBodyPlan,
  createBaseBodyPlan,
  deriveMovementProfile,
  prepareDNA,
} from '@/ecs/bodyPlan'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const HUNTER_COLORS = [
  '#ff2f00', '#ff5e00', '#ff8b00', '#ffb000', '#ff3b3b',
  '#ff6b6b', '#ff8fa3', '#ff4f64', '#ff5d94', '#ff7b5f',
  '#ff914d', '#ff9f1c', '#ff7a00', '#ff5f3c', '#ff6f52',
  '#ff3d2e', '#ff785a', '#ff584f', '#ff6c3a', '#ff4e1a',
]

const PREY_COLORS = [
  '#1c9eff', '#3bb0ff', '#5cc2ff', '#7cd4ff', '#9ee5ff',
  '#2299c9', '#38bdf8', '#22d3ee', '#0ea5e9', '#0891b2',
  '#0ea3b0', '#1fbccf', '#4dd0e1', '#6bd8f2', '#8ddcf7',
  '#7ea5ff', '#6690f5', '#4f83ff', '#3a6bff', '#3b82f6',
]

function createContext(config: WorldConfig): SimulationContext {
  const world = createWorld()
  const rng = mulberry32(config.rngSeed)
  const registry = createRegistry(world)
  return {
    world,
    registry,
    config,
    tick: 0,
    nextRainMs: randRange(rng, 20_000, 300_000),
    rng,
    agents: new Map(),
    plants: new Map(),
    genomes: new Map(),
    locomotion: new Map(),
    pregnancies: new Map(),
    birthTick: new Map(),
    parentMap: new Map(),
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
  ctx.locomotion.clear()
  ctx.pregnancies.clear()
  ctx.birthTick.clear()
  ctx.parentMap.clear()
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
    ctx.locomotion.set(
      agent.id,
      deriveMovementProfile(preparedDNA.bodyPlan, preparedDNA.archetype, preparedDNA.biome),
    )
    ctx.birthTick.set(agent.id, snapshot.tick)
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
  const totalAgents = ctx.config.maxAgents
  const archetypeSlots: Archetype[] = ['hunter', 'hunter', 'prey', 'prey', 'scavenger', 'scavenger']
  const clusterCount = archetypeSlots.length
  const perCluster = Math.floor(totalAgents / clusterCount)
  const remainder = totalAgents % clusterCount
  const radius = Math.min(ctx.config.bounds.x, ctx.config.bounds.y) * 0.02
  const center = { x: ctx.config.bounds.x / 2, y: ctx.config.bounds.y / 2 }
  const clusterCenters = Array.from({ length: clusterCount }).map((_, idx) => {
    const angle = (Math.PI * 2 * idx) / clusterCount
    return {
      x: center.x + Math.cos(angle) * radius * 3,
      y: center.y + Math.sin(angle) * radius * 3,
    }
  })
  archetypeSlots.forEach((archetype, idx) => {
    const count = perCluster + (idx < remainder ? 1 : 0)
    const clusterCenter = clusterCenters[idx]
    const colorPool = archetype === 'hunter' ? HUNTER_COLORS : PREY_COLORS
    const color = colorPool[idx % colorPool.length]
    for (let i = 0; i < count; i++) {
      const dna = { ...buildDNA(ctx, archetype), familyColor: colorPool[(idx + i) % colorPool.length] }
      spawnAgent(ctx, archetype, dna, jitter(ctx.rng, clusterCenter, radius * 0.8))
    }
  })

  for (let i = 0; i < ctx.config.maxPlants; i++) {
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
          spawnAgent(
            ctx,
            dna.archetype,
            dna,
            position,
            options?.mutationMask ?? 0,
            options?.parentId,
          ),
      },
      dt,
    ),
  )
  measure('population', () => enforcePopulationTargets(ctx, controls, dtMs))

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
  dnaOverride?: DNAState,
  positionOverride?: Vector2,
  mutationMask = 0,
  parentId?: number,
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
    energy: dna.hungerThreshold * 12,
    fatStore: dna.fatCapacity * 0.8,
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
  ctx.locomotion.set(id, deriveMovementProfile(dna.bodyPlan, dna.archetype, dna.biome))
  ctx.agentIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  ctx.metrics.births++
  ctx.birthTick.set(id, ctx.tick)
  if (parentId !== undefined) {
    ctx.parentMap.set(id, parentId)
  }
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

function enforcePopulationTargets(ctx: SimulationContext, controls: ControlState, dtMs: number) {
  let availableSlots = Math.max(0, controls.maxAgents - ctx.agents.size)
  const archetypes: Archetype[] = ['hunter', 'prey']
  const biomes: Biome[] = ['land', 'air', 'water']

  const counts = new Map<string, number>()
  biomes.forEach((biome) =>
    archetypes.forEach((archetype) => {
      counts.set(`${biome}:${archetype}`, 0)
    }),
  )

  ctx.genomes.forEach((dna) => {
    if (dna.archetype !== 'hunter' && dna.archetype !== 'prey') return
    const key = `${dna.biome}:${dna.archetype}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  for (const biome of biomes) {
    for (const archetype of archetypes) {
      if (availableSlots <= 0) break
      const key = `${biome}:${archetype}`
      if ((counts.get(key) ?? 0) === 0) {
        const toSpawn = Math.min(45, availableSlots)
        for (let i = 0; i < toSpawn; i++) {
          const dna = buildDNA(ctx, archetype, biome)
          const entity = spawnAgent(ctx, archetype, dna)
          DNA.mutationRate[entity] = controls.mutationRate
        }
        availableSlots -= toSpawn
      }
    }
  }

  handleRainyGrowth(ctx, controls, dtMs)
}

function rainIntervalMs(ctx: SimulationContext) {
  return randRange(ctx.rng, 20_000, 300_000)
}

function handleRainyGrowth(ctx: SimulationContext, controls: ControlState, dtMs: number) {
  ctx.nextRainMs -= dtMs
  while (ctx.nextRainMs <= 0) {
    const plantDeficit = controls.maxPlants - ctx.plants.size
    if (plantDeficit > 0) {
      for (let i = 0; i < plantDeficit; i++) {
        spawnPlant(ctx)
      }
    }
    ctx.nextRainMs += rainIntervalMs(ctx)
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
  ctx.locomotion.delete(id)
  ctx.locomotion.delete(id)
  ctx.birthTick.delete(id)
  ctx.parentMap.forEach((parent, childId) => {
    if (parent === id) ctx.parentMap.delete(childId)
  })
  ctx.metrics.deaths++
}

function buildDNA(ctx: SimulationContext, archetype: Archetype, biome: Biome = 'land'): DNAState {
  const speedBase = archetype === 'hunter' ? randRange(ctx.rng, 320, 420) : randRange(ctx.rng, 180, 260)
  const vision = archetype === 'hunter' ? randRange(ctx.rng, 260, 360) : randRange(ctx.rng, 180, 280)
  const hungerThreshold = archetype === 'hunter' ? randRange(ctx.rng, 60, 90) : randRange(ctx.rng, 40, 70)
  const bodyPlan = createBaseBodyPlan(archetype, biome)

  return {
    archetype,
    biome,
    familyColor: archetype === 'hunter'
      ? HUNTER_COLORS[Math.floor(ctx.rng() * HUNTER_COLORS.length)]
      : PREY_COLORS[Math.floor(ctx.rng() * PREY_COLORS.length)],
    baseSpeed: speedBase,
    visionRange: vision,
    hungerThreshold,
    fatCapacity: randRange(ctx.rng, 120, 2000),
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
    bodyMass: randRange(ctx.rng, archetype === 'hunter' ? 1.2 : 0.8, archetype === 'hunter' ? 20 : 14),
    metabolism: randRange(ctx.rng, 6, 12),
    turnRate: randRange(ctx.rng, 1, 3),
    curiosity: randRange(ctx.rng, 0.3, 0.9),
    cohesion: randRange(ctx.rng, 0.2, 0.8),
    fear: randRange(ctx.rng, 0.2, 0.8),
    speciesFear: archetype === 'hunter' ? randRange(ctx.rng, 0.1, 0.5) : randRange(ctx.rng, 0.4, 0.9),
    conspecificFear:
      archetype === 'hunter' ? randRange(ctx.rng, 0.05, 0.35) : randRange(ctx.rng, 0.2, 0.55),
    sizeFear: randRange(ctx.rng, 0.2, 0.9),
    dependency: randRange(ctx.rng, 0.1, 0.9),
    independenceAge: randRange(ctx.rng, 10, 50),
    camo: randRange(ctx.rng, 0.1, 0.7),
    awareness: randRange(ctx.rng, 0.5, 1),
    cowardice: archetype === 'hunter' ? randRange(ctx.rng, 0.15, 0.55) : randRange(ctx.rng, 0.35, 0.9),
    fertility: randRange(ctx.rng, 0.25, 0.8),
    gestationCost: randRange(ctx.rng, 5, 20),
    moodStability: randRange(ctx.rng, 0.2, 0.9),
    preferredFood: archetype === 'hunter' ? ['prey'] : ['plant'],
    stamina: randRange(ctx.rng, 0.7, 1.4),
    circadianBias:
      archetype === 'hunter' ? randRange(ctx.rng, 0.2, 0.8) : randRange(ctx.rng, -0.8, 0.4),
    sleepEfficiency: randRange(ctx.rng, 0.5, 1),
    scavengerAffinity: archetype === 'hunter' || archetype === 'prey' ? 0 : randRange(ctx.rng, 0.2, 0.6),
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
