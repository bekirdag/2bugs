import { createWorld, removeEntity } from 'bitecs'

import { Body, DNA, Energy, Fertilizer, Obstacle, Position } from './components'
import {
  createRegistry,
  serializeAgentEntity,
  serializeCorpseEntity,
  serializeFertilizerEntity,
  serializeManureEntity,
  serializePlantEntity,
  spawnAgentEntity,
  spawnCorpseEntity,
  spawnFertilizerEntity,
  spawnManureEntity,
  spawnPlantEntity,
  spawnRockEntity,
} from './registry'
import type { SimulationContext } from './types'
import { perceptionSystem } from './systems/perceptionSystem'
import { commitIntentSystem } from './systems/commitIntentSystem'
import { lifecycleSystem } from './systems/lifecycleSystem'
import { movementSystem } from './systems/movementSystem'
import { interactionSystem } from './systems/interactionSystem'
import { metabolismSystem } from './systems/metabolismSystem'
import { plantGrowthSystem } from './systems/plantSystem'
import { reproductionSystem } from './systems/reproductionSystem'
import { flockingSystem } from './systems/flockingSystem'
import { circadianSystem } from './systems/circadianSystem'
import { corpseSystem } from './systems/corpseSystem'
import { manureSystem } from './systems/manureSystem'

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
import { generateRocks } from '@/sim/rocks'
import { clamp } from '@/utils/math'
import {
  BODY_PLAN_VERSION,
  cloneBodyPlan,
  createBaseBodyPlan,
  deriveMovementProfile,
  prepareDNA,
} from '@/ecs/bodyPlan'
import {
  DEFAULT_MATURITY_YEARS,
  SIM_YEAR_TICKS,
  ageTicksFromYearsWithYearTicks,
  ageYearsFromTicksWithYearTicks,
  effectiveFatCapacity,
  maxMassForLevel,
} from '@/ecs/lifecycle'
import { spawnPlantNearPosition } from '@/ecs/fertilization'

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

const SCAVENGER_COLORS = [
  '#8b5a2b', // brown
  '#a16207', // amber-brown
  '#92400e', // deep amber
  '#78350f', // dark brown
  '#b45309', // warm brown
]

const POPULATION_SLOTS: { archetype: Archetype; biome: Biome }[] = [
  { archetype: 'hunter', biome: 'land' },
  { archetype: 'prey', biome: 'land' },
  { archetype: 'scavenger', biome: 'land' },
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
    yearTicks: SIM_YEAR_TICKS,
    nextRainMs: randRange(rng, 20_000, 300_000),
    rng,
    agents: new Map(),
    plants: new Map(),
    corpses: new Map(),
    manures: new Map(),
    fertilizers: new Map(),
    rocks: new Map(),
    genomes: new Map(),
    locomotion: new Map(),
    pregnancies: new Map(),
    birthTick: new Map(),
    parentMap: new Map(),
    agentIndex: new SpatialHash<number>(config.spatialHashCellSize),
    plantIndex: new SpatialHash<number>(config.spatialHashCellSize),
    corpseIndex: new SpatialHash<number>(config.spatialHashCellSize),
    manureIndex: new SpatialHash<number>(config.spatialHashCellSize),
    fertilizerIndex: new SpatialHash<number>(config.spatialHashCellSize),
    rockIndex: new SpatialHash<number>(config.spatialHashCellSize),
    nextAgentId: 1,
    nextPlantId: 1,
    nextCorpseId: 1,
    nextManureId: 1,
    nextFertilizerId: 1,
    nextRockId: 1,
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
  spawnRocks(ctx)
  spawnInitialPopulation(ctx)
  return ctx
}

export function createWorldFromSnapshot(snapshot: SimulationSnapshot): SimulationContext {
  const ctx = initWorld(snapshot.config)
  ctx.world = createWorld()
  ctx.registry = createRegistry(ctx.world)
  ctx.agents.clear()
  ctx.plants.clear()
  ctx.corpses.clear()
  ctx.manures.clear()
  ctx.fertilizers.clear()
  ctx.rocks.clear()
  ctx.genomes.clear()
  ctx.locomotion.clear()
  ctx.pregnancies.clear()
  ctx.birthTick.clear()
  ctx.parentMap.clear()
  ctx.nextAgentId = 1
  ctx.nextPlantId = 1
  ctx.nextCorpseId = 1
  ctx.nextManureId = 1
  ctx.nextFertilizerId = 1
  ctx.nextRockId = 1
  ctx.agentIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  ctx.plantIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  ctx.corpseIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  ctx.manureIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  ctx.fertilizerIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  ctx.rockIndex = new SpatialHash<number>(ctx.config.spatialHashCellSize)
  spawnRocks(ctx)

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
    const ageTicks = ageTicksFromYearsWithYearTicks(agent.age ?? 0, ctx.yearTicks)
    ctx.birthTick.set(agent.id, snapshot.tick - ageTicks)
    ctx.agentIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id: agent.id, data: agent.id })
  })
  snapshot.plants.forEach((plant) => {
    const entity = spawnPlantEntity(ctx.registry, plant)
    ctx.plants.set(plant.id, entity)
    ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id: plant.id, data: plant.id })
  })

  const corpses = snapshot.corpses ?? []
  corpses.forEach((corpse) => {
    const entity = spawnCorpseEntity(ctx.registry, corpse)
    ctx.corpses.set(corpse.id, entity)
    ctx.corpseIndex.set(corpse.position, { id: corpse.id, data: corpse.id })
  })

  const manures = snapshot.manures ?? []
  manures.forEach((manure) => {
    const entity = spawnManureEntity(ctx.registry, manure)
    ctx.manures.set(manure.id, entity)
    ctx.manureIndex.set(manure.position, { id: manure.id, data: manure.id })
  })

  const fertilizers = snapshot.fertilizers ?? []
  fertilizers.forEach((fertilizer) => {
    const entity = spawnFertilizerEntity(ctx.registry, fertilizer)
    ctx.fertilizers.set(fertilizer.id, entity)
    ctx.fertilizerIndex.set(fertilizer.position, { id: fertilizer.id, data: fertilizer.id })
  })

  ctx.nextAgentId = Math.max(...snapshot.agents.map((a) => a.id), 0) + 1
  ctx.nextPlantId = Math.max(...snapshot.plants.map((p) => p.id), 0) + 1
  ctx.nextCorpseId = Math.max(...corpses.map((c) => c.id), 0) + 1
  ctx.nextManureId = Math.max(...manures.map((m) => m.id), 0) + 1
  ctx.nextFertilizerId = Math.max(...fertilizers.map((f) => f.id), 0) + 1
  ctx.metrics = {
    births: snapshot.stats.totalBirths,
    deaths: snapshot.stats.totalDeaths,
    mutations: snapshot.stats.mutations,
  }

  return ctx
}

function spawnRocks(ctx: SimulationContext) {
  const rocks = generateRocks(ctx.config)
  rocks.forEach((rock) => {
    const entity = spawnRock(ctx, rock.position, rock.radius)
    ctx.rocks.set(rock.id, entity)
    ctx.rockIndex.set(rock.position, { id: rock.id, data: rock.id })
    ctx.nextRockId = Math.max(ctx.nextRockId, rock.id + 1)
  })
}

function spawnRock(ctx: SimulationContext, position: Vector2, radius: number) {
  // Keep rocks out of snapshot payloads for now; they are deterministic from config seed.
  return spawnRockEntity(ctx.registry, { position, radius })
}

function spawnInitialPopulation(ctx: SimulationContext) {
  const totalAgents = ctx.config.maxAgents
  const clusterCount = POPULATION_SLOTS.length
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
  POPULATION_SLOTS.forEach(({ archetype, biome }, idx) => {
    const count = perCluster + (idx < remainder ? 1 : 0)
    const clusterCenter = clusterCenters[idx]
    const colorPool = archetype === 'hunter' ? HUNTER_COLORS : archetype === 'scavenger' ? SCAVENGER_COLORS : PREY_COLORS
    for (let i = 0; i < count; i++) {
      const dna = {
        ...buildDNA(ctx, archetype, biome),
        familyColor: colorPool[(idx + i) % colorPool.length],
      }
      spawnAgent(ctx, archetype, dna, jitter(ctx.rng, clusterCenter, radius * 0.8), 0, undefined, false)
    }
  })

  for (let i = 0; i < ctx.config.maxPlants; i++) {
    spawnPlant(ctx)
  }
}

export function stepWorld(ctx: SimulationContext, dtMs: number, controls: ControlState): Record<string, number> {
  const dt = dtMs / 1000
  ctx.yearTicks = Math.max(1, Math.floor(controls.yearTicks ?? ctx.yearTicks ?? SIM_YEAR_TICKS))
  const timings: Record<string, number> = {}
  const measure = <T>(label: string, fn: () => T): T => {
    const start = now()
    const result = fn()
    timings[label] = (timings[label] ?? 0) + (now() - start)
    return result
  }

  measure('perception', () => perceptionSystem(ctx, controls))
  measure('intent', () => commitIntentSystem(ctx))
  measure('flocking', () => flockingSystem(ctx, dt, controls.flockingStrength ?? 1))
  measure('circadian', () => circadianSystem(ctx, dt))
  measure('lifecycle', () => lifecycleSystem(ctx))
  measure('movement', () =>
    movementSystem(ctx, dt, controls.speed, controls.curiosityBias ?? 0, controls.fatSpeedPenalty ?? 1),
  )
	  measure('interaction', () =>
	    interactionSystem(
	      ctx,
	      {
	        killAgent: (id) => killAgentToCorpse(ctx, id),
	        removePlant: (id) => removePlant(ctx, id),
	        removeCorpse: (id) => removeCorpse(ctx, id),
	      },
	      controls.aggressionBias ?? 0,
	      {
	        maturityYears: controls.maturityYears ?? 6,
	        satiationMultiplier: controls.satiationMultiplier ?? 1,
	        massBuildCost: controls.massBuildCost ?? 35,
	      },
	    ),
	  )
  measure('manure', () => manureSystem(ctx, dt))
  const expired = measure('metabolism', () => metabolismSystem(ctx, dt, controls))
  measure('expire', () => expireAgents(ctx, expired))
  measure('corpses', () => corpseSystem(ctx, dt))
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
            true,
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
      serializeAgentEntity(
        entity,
        ageYearsFromTicksWithYearTicks(ctx.tick - (ctx.birthTick.get(id) ?? ctx.tick), ctx.yearTicks),
        ctx.genomes.get(id),
      ),
    ),
    plants: Array.from(ctx.plants.entries()).map(([id, entity]) => serializePlantEntity(entity, id)),
    corpses: Array.from(ctx.corpses.entries()).map(([id, entity]) => serializeCorpseEntity(entity, id)),
    manures: Array.from(ctx.manures.entries()).map(([id, entity]) => serializeManureEntity(entity, id)),
    fertilizers: Array.from(ctx.fertilizers.entries()).map(([id, entity]) => serializeFertilizerEntity(entity, id)),
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
  countBirth = true,
) {
  const dna = prepareDNA(dnaOverride ?? buildDNA(ctx, archetype))
  const id = ctx.nextAgentId++
  const desiredPosition = {
    x: positionOverride?.x ?? randRange(ctx.rng, 0, ctx.config.bounds.x),
    y: positionOverride?.y ?? randRange(ctx.rng, 0, ctx.config.bounds.y),
  }
  const agentRadius = archetype === 'hunter' ? 18 : 14
  const position = findOpenPosition(ctx, desiredPosition, agentRadius)
  // Start slightly under genetic adult size so bodies can grow over time.
  // Newborns start much smaller, while seeded populations start closer to adult.
  const juvenileRatio = countBirth ? randRange(ctx.rng, 0.45, 0.75) : randRange(ctx.rng, 0.75, 1)
  const mass = Math.max(0.2, dna.bodyMass * juvenileRatio)
  let ageYears = 0
  if (!countBirth) {
    // Seeded worlds should not start as all newborns; pick an age that can support the chosen starting mass.
    let requiredLevel = 0
    for (let level = 0; level <= DEFAULT_MATURITY_YEARS + 6; level++) {
      if (maxMassForLevel(dna.bodyMass, level) >= mass) {
        requiredLevel = level
        break
      }
    }
    ageYears = randRange(ctx.rng, requiredLevel, requiredLevel + 0.95)
  }
  const fatCapacity = effectiveFatCapacity(dna, mass)
  const state: AgentState = {
    id,
    dna,
    mass,
    position: {
      x: position.x,
      y: position.y,
    },
    velocity: { x: 0, y: 0 },
    heading: randRange(ctx.rng, 0, Math.PI * 2),
    energy: dna.hungerThreshold * 12,
    fatStore: fatCapacity * 0.8,
    age: ageYears,
    mode: 'patrol',
    mood: { stress: 0.25, focus: 0.5, social: 0.5, fatigue: 0, kind: 'idle', tier: 'growth', intensity: 0 },
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
  // Ensure component stays in sync with our phenotype state.
  Body.mass[entity] = mass
  if (countBirth) {
    ctx.metrics.births++
  }
  ctx.birthTick.set(id, ctx.tick - ageTicksFromYearsWithYearTicks(ageYears, ctx.yearTicks))
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
      ...findOpenPosition(
        ctx,
        { x: randRange(ctx.rng, 0, ctx.config.bounds.x), y: randRange(ctx.rng, 0, ctx.config.bounds.y) },
        10,
      ),
    },
    size: dna.biomass,
    moisture: randRange(ctx.rng, 0.4, 1),
  }

  const entity = spawnPlantEntity(ctx.registry, plant)
  ctx.plants.set(id, entity)
  ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
}

function expireAgents(ctx: SimulationContext, ids: number[]) {
  ids.forEach((id) => {
    killAgentToCorpse(ctx, id)
  })
}

function enforcePopulationTargets(ctx: SimulationContext, controls: ControlState, dtMs: number) {
  let availableSlots = Math.max(0, controls.maxAgents - ctx.agents.size)
  const slots = POPULATION_SLOTS
  const perSlot = Math.floor(controls.maxAgents / Math.max(1, slots.length))
  const remainder = controls.maxAgents % Math.max(1, slots.length)

  const counts = new Map<string, number>()
  slots.forEach((slot) => {
    counts.set(`${slot.biome}:${slot.archetype}`, 0)
  })

  ctx.genomes.forEach((dna) => {
    const key = `${dna.biome}:${dna.archetype}`
    if (!counts.has(key)) return
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  // Do not replace individuals as they die.
  // Only when a whole "sort" (biome + archetype) goes extinct, spawn a full new batch for that sort.
  for (let i = 0; i < slots.length; i++) {
    if (availableSlots <= 0) break
    const slot = slots[i]
    const key = `${slot.biome}:${slot.archetype}`
    const current = counts.get(key) ?? 0
    if (current > 0) continue

    const desired = perSlot + (i < remainder ? 1 : 0)
    const toSpawn = Math.min(Math.max(1, desired), availableSlots)
    for (let j = 0; j < toSpawn; j++) {
      const dna = buildDNA(ctx, slot.archetype, slot.biome)
      const entity = spawnAgent(ctx, slot.archetype, dna, undefined, 0, undefined, false)
      DNA.mutationRate[entity] = controls.mutationRate
    }
    availableSlots -= toSpawn
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
      // Spawn new plants prioritizing fertilizer-rich soil first.
      let remaining = plantDeficit
      if (ctx.fertilizers.size > 0) {
        const fertilizerIds = Array.from(ctx.fertilizers.keys())
        for (let i = 0; i < plantDeficit; i++) {
          if (remaining <= 0) break
          // Prefer fertilizer patches that still have nutrients.
          let picked: number | null = null
          for (let attempts = 0; attempts < 12; attempts++) {
            const candidateId = fertilizerIds[Math.floor(ctx.rng() * fertilizerIds.length)]
            const candidateEntity = ctx.fertilizers.get(candidateId)
            if (candidateEntity === undefined) continue
            if ((Fertilizer.nutrients[candidateEntity] || 0) <= 0.1) continue
            picked = candidateId
            break
          }
          if (picked === null) break
          const fertEntity = ctx.fertilizers.get(picked)
          if (fertEntity === undefined) break
          spawnPlantNearPosition(
            ctx,
            { x: Position.x[fertEntity], y: Position.y[fertEntity] },
            Math.max(18, Fertilizer.radius[fertEntity] || 70),
          )
          remaining--
        }
      }

      // Any remaining spawn budget is distributed across the rest of the world.
      for (let i = 0; i < remaining; i++) {
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

function removeCorpse(ctx: SimulationContext, id: number) {
  const entity = ctx.corpses.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.corpses.delete(id)
  ctx.corpseIndex.delete(id)
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

function killAgentToCorpse(ctx: SimulationContext, id: number): number | null {
  const entity = ctx.agents.get(id)
  if (entity === undefined) return null

  const genome = ctx.genomes.get(id)
  const bodyMass = clamp(Body.mass[entity] || genome?.bodyMass || (Energy.fatCapacity[entity] || 120) / 120, 0.2, 80)
  const fatCapacity = Math.max(1, Energy.fatCapacity[entity] || genome?.fatCapacity || 120)
  const fatStore = Math.max(0, Energy.fatStore[entity] || 0)

  const weightScale = 1 + (fatStore / fatCapacity) * 0.7
  const radius = clamp((6 + bodyMass * 3) * weightScale, 6, 320)

  const baseBiomass = bodyMass * 110
  const storedReserves = fatCapacity * 0.06 + fatStore * 0.5
  const nutrients = Math.max(40, baseBiomass + storedReserves)

  // Decomposition: scale with size; larger corpses linger longer.
  const maxDecay = clamp(120 + bodyMass * 18, 90, 1800) // seconds
  const corpseId = ctx.nextCorpseId++
  const corpseEntity = spawnCorpseEntity(ctx.registry, {
    position: { x: Position.x[entity], y: Position.y[entity] },
    radius,
    nutrients,
    decay: maxDecay,
    maxDecay,
  })

  ctx.corpses.set(corpseId, corpseEntity)
  ctx.corpseIndex.set({ x: Position.x[corpseEntity], y: Position.y[corpseEntity] }, { id: corpseId, data: corpseId })

  removeAgent(ctx, id)
  return corpseId
}

function findOpenPosition(ctx: SimulationContext, desired: Vector2, radius: number): Vector2 {
  // Rocks are deterministic but static; keep new entities from spawning inside them.
  if (!isBlockedByRock(ctx, desired, radius)) return desired

  // Try a few local jitters first so clusters remain clustered.
  for (let i = 0; i < 16; i++) {
    const candidate = jitter(ctx.rng, desired, 40 + radius)
    if (!isBlockedByRock(ctx, candidate, radius)) return candidate
  }

  // Fall back to global retries.
  for (let i = 0; i < 40; i++) {
    const candidate = { x: randRange(ctx.rng, 0, ctx.config.bounds.x), y: randRange(ctx.rng, 0, ctx.config.bounds.y) }
    if (!isBlockedByRock(ctx, candidate, radius)) return candidate
  }

  return desired
}

function isBlockedByRock(ctx: SimulationContext, position: Vector2, radius: number) {
  if (ctx.rocks.size === 0) return false
  for (const rockEntity of ctx.rocks.values()) {
    const dx = position.x - Position.x[rockEntity]
    const dy = position.y - Position.y[rockEntity]
    const min = (Obstacle.radius[rockEntity] || 0) + radius
    if (dx * dx + dy * dy <= min * min) return true
  }
  return false
}

function buildDNA(ctx: SimulationContext, archetype: Archetype, biome: Biome = 'land'): DNAState {
  const speedBase =
    archetype === 'hunter'
      ? randRange(ctx.rng, 320, 420)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 240, 340)
        : randRange(ctx.rng, 180, 260)
  const vision =
    archetype === 'hunter'
      ? randRange(ctx.rng, 260, 360)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 220, 340)
        : randRange(ctx.rng, 180, 280)
  const hungerThreshold =
    archetype === 'hunter'
      ? randRange(ctx.rng, 60, 90)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 55, 85)
        : randRange(ctx.rng, 40, 70)
  const forageStartRatio =
    archetype === 'hunter'
      ? randRange(ctx.rng, 0.55, 0.9)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 0.65, 0.92)
        : randRange(ctx.rng, 0.5, 0.88)
  const eatingGreed =
    archetype === 'hunter'
      ? randRange(ctx.rng, 0.55, 0.95)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 0.45, 0.85)
        : randRange(ctx.rng, 0.35, 0.8)
  const bodyMass = randRange(
    ctx.rng,
    archetype === 'hunter' ? 1.2 : archetype === 'scavenger' ? 0.9 : 0.8,
    archetype === 'hunter' ? 20 : archetype === 'scavenger' ? 16 : 14,
  )
  // Keep fat capacity roughly proportional to body mass so "max fat limited by ratio" holds naturally.
  // This treats `120` energy-units per 1.0 mass as the baseline conversion (see `ecs/lifecycle.ts`).
  const fatCapacityRatio =
    archetype === 'hunter'
      ? randRange(ctx.rng, 0.6, 1.4)
      : archetype === 'scavenger'
        ? randRange(ctx.rng, 0.8, 1.8)
        : randRange(ctx.rng, 0.7, 1.6)
  const fatCapacity = bodyMass * 120 * fatCapacityRatio
  const maturityBase = 1 + Math.pow(clamp(bodyMass, 0.2, 80), 0.55) * 2.6
  const maturityArchetypeBias = archetype === 'hunter' ? 1.6 : archetype === 'scavenger' ? 1 : 0
  const maturityAgeYears = clamp(maturityBase + maturityArchetypeBias + randRange(ctx.rng, -1.25, 1.75), 1, 20)
  const bodyPlan = createBaseBodyPlan(archetype, biome)

  return {
    archetype,
    biome,
    familyColor: archetype === 'hunter'
      ? HUNTER_COLORS[Math.floor(ctx.rng() * HUNTER_COLORS.length)]
      : archetype === 'scavenger'
        ? SCAVENGER_COLORS[Math.floor(ctx.rng() * SCAVENGER_COLORS.length)]
      : PREY_COLORS[Math.floor(ctx.rng() * PREY_COLORS.length)],
    baseSpeed: speedBase,
    visionRange: vision,
    hungerThreshold,
    forageStartRatio,
    eatingGreed,
    fatCapacity,
    // Keep a reserve so animals don't instantly burn all storage.
    fatBurnThreshold: fatCapacity * randRange(ctx.rng, 0.25, 0.65),
    patrolThreshold: randRange(ctx.rng, 0.4, 0.9) * hungerThreshold,
    aggression:
      archetype === 'hunter'
        ? randRange(ctx.rng, 0.6, 1)
        : archetype === 'scavenger'
          ? randRange(ctx.rng, 0.05, 0.25)
          : randRange(ctx.rng, 0.2, 0.6),
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
    mutationRate: randRange(ctx.rng, 0.005, 0.03),
    bodyMass,
    metabolism: randRange(ctx.rng, 6, 12),
    turnRate: randRange(ctx.rng, 1, 3),
    curiosity: randRange(ctx.rng, 0.3, 0.9),
    cohesion: randRange(ctx.rng, 0.2, 0.8),
    fear: randRange(ctx.rng, 0.2, 0.8),
    speciesFear: archetype === 'hunter' ? randRange(ctx.rng, 0.1, 0.5) : randRange(ctx.rng, 0.4, 0.9),
    conspecificFear:
      archetype === 'hunter' ? randRange(ctx.rng, 0.05, 0.35) : randRange(ctx.rng, 0.2, 0.55),
    sizeFear: randRange(ctx.rng, 0.2, 0.9),
    preySizeTargetRatio: archetype === 'hunter' ? randRange(ctx.rng, 0.15, 1) : 0.9,
    dependency: randRange(ctx.rng, 0.1, 0.9),
    independenceAge: randRange(ctx.rng, 10, 50),
    camo: randRange(ctx.rng, 0.1, 0.7),
    awareness: randRange(ctx.rng, 0.5, 1),
    cowardice: archetype === 'hunter' ? randRange(ctx.rng, 0.15, 0.55) : randRange(ctx.rng, 0.35, 0.9),
    fertility: randRange(ctx.rng, 0.25, 0.8),
    gestationCost: randRange(ctx.rng, 5, 20),
    moodStability: randRange(ctx.rng, 0.2, 0.9),
    maturityAgeYears,
    // Scavengers only eat dead meat (corpse entities), not plants or live animals.
    preferredFood: archetype === 'hunter' ? ['prey'] : archetype === 'scavenger' ? [] : ['plant'],
    stamina: randRange(ctx.rng, 0.7, 1.4),
    circadianBias:
      archetype === 'hunter' ? randRange(ctx.rng, 0.2, 0.8) : randRange(ctx.rng, -0.8, 0.4),
    sleepEfficiency: randRange(ctx.rng, 0.5, 1),
    scavengerAffinity:
      archetype === 'scavenger' ? randRange(ctx.rng, 0.8, 1) : archetype === 'hunter' || archetype === 'prey' ? 0 : randRange(ctx.rng, 0.2, 0.6),
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
