import { Fertilizer, Obstacle, Position } from './components'
import { removeEntity } from 'bitecs'
import { spawnFertilizerEntity, spawnPlantEntity } from './registry'
import type { SimulationContext } from './types'

import type { PlantDNA, PlantState, Vector2 } from '@/types/sim'
import { clamp } from '@/utils/math'
import { jitter, randItem, randRange } from '@/utils/rand'

const MAX_BIOMASS = 1.6
const MIN_BIOMASS = 0.1
export const FERTILIZER_COST_PER_BIOMASS = 320

export function fertilizerRadiusFromNutrients(nutrients: number) {
  return clamp(70 + nutrients * 0.08, 70, 240)
}

export function depositFertilizer(ctx: SimulationContext, position: Vector2, nutrients: number, radius?: number) {
  const clamped = clamp(nutrients, 0, 1_000_000)
  if (clamped <= 0.1) return null
  const fertilizerRadius = radius ?? fertilizerRadiusFromNutrients(clamped)
  const id = ctx.nextFertilizerId++
  const entity = spawnFertilizerEntity(ctx.registry, {
    position: wrapToBounds(ctx, position),
    radius: fertilizerRadius,
    nutrients: clamped,
  })
  ctx.fertilizers.set(id, entity)
  ctx.fertilizerIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  return id
}

export function spawnPlantNearPosition(ctx: SimulationContext, source: Vector2, radius: number) {
  const id = ctx.nextPlantId++
  const dna = createPlantDNA(ctx)

  const desired = jitter(ctx.rng, source, Math.max(18, radius))
  const position = findOpenPosition(ctx, wrapToBounds(ctx, desired), 10)
  const plant: PlantState = {
    id,
    dna,
    position,
    size: dna.biomass,
    moisture: clamp(randRange(ctx.rng, 0.4, 1), 0, 1),
  }

  const entity = spawnPlantEntity(ctx.registry, plant)
  ctx.plants.set(id, entity)
  ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  return id
}

export function spawnPlantOnFertilizer(ctx: SimulationContext, fertilizerId: number): number | null {
  const fertilizerEntity = ctx.fertilizers.get(fertilizerId)
  if (fertilizerEntity === undefined) return null

  const radius = Math.max(18, Fertilizer.radius[fertilizerEntity] || 70)
  const center = { x: Position.x[fertilizerEntity], y: Position.y[fertilizerEntity] }

  const baseBiomass = clamp(randRange(ctx.rng, 0.8, 1.2), MIN_BIOMASS, MAX_BIOMASS)
  const available = Fertilizer.nutrients[fertilizerEntity] || 0
  if (available <= 0.1) {
    removeFertilizer(ctx, fertilizerId)
    return null
  }
  const maxAffordable = available / Math.max(FERTILIZER_COST_PER_BIOMASS, 1)
  if (maxAffordable < MIN_BIOMASS) return null
  let biomass = baseBiomass
  if (maxAffordable < baseBiomass) {
    biomass = maxAffordable
  } else {
    const extra = Math.min(MAX_BIOMASS - baseBiomass, maxAffordable - baseBiomass)
    biomass = baseBiomass + extra
  }
  biomass = clamp(biomass, MIN_BIOMASS, MAX_BIOMASS)
  const id = ctx.nextPlantId++
  const dna = createPlantDNA(ctx, biomass)
  const position = findOpenPositionInRadius(ctx, center, radius, 10)
  if (!position) return null
  Fertilizer.nutrients[fertilizerEntity] = Math.max(0, available - biomass * FERTILIZER_COST_PER_BIOMASS)
  if (Fertilizer.nutrients[fertilizerEntity] <= 0.1) {
    removeFertilizer(ctx, fertilizerId)
  }
  const plant: PlantState = {
    id,
    dna,
    position,
    size: dna.biomass,
    moisture: clamp(randRange(ctx.rng, 0.4, 1), 0, 1),
  }
  const entity = spawnPlantEntity(ctx.registry, plant)
  ctx.plants.set(id, entity)
  ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  return id
}

function createPlantDNA(ctx: SimulationContext, biomass?: number): PlantDNA {
  return {
    biomass: clamp(biomass ?? randRange(ctx.rng, 0.8, 1.2), MIN_BIOMASS, MAX_BIOMASS),
    regrowthRate: randRange(ctx.rng, 0.3, 0.7),
    seedSpread: randRange(ctx.rng, 0.2, 0.8),
    pigment: randItem(ctx.rng, ['#2ab811', '#3dad2a', '#7fe52f']),
    nutrientDensity: randRange(ctx.rng, 0.4, 1),
    thorns: randRange(ctx.rng, 0, 0.5),
    seasonPreference: randRange(ctx.rng, -1, 1),
  }
}

function removeFertilizer(ctx: SimulationContext, id: number) {
  const entity = ctx.fertilizers.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.fertilizers.delete(id)
  ctx.fertilizerIndex.delete(id)
}

function wrapToBounds(ctx: SimulationContext, position: Vector2): Vector2 {
  const { x: w, y: h } = ctx.config.bounds
  return {
    x: ((position.x % w) + w) % w,
    y: ((position.y % h) + h) % h,
  }
}

function findOpenPosition(ctx: SimulationContext, desired: Vector2, radius: number): Vector2 {
  if (!isBlockedByRock(ctx, desired, radius)) return desired
  for (let i = 0; i < 16; i++) {
    const candidate = wrapToBounds(ctx, jitter(ctx.rng, desired, 35 + radius))
    if (!isBlockedByRock(ctx, candidate, radius)) return candidate
  }
  for (let i = 0; i < 32; i++) {
    const candidate = {
      x: randRange(ctx.rng, 0, ctx.config.bounds.x),
      y: randRange(ctx.rng, 0, ctx.config.bounds.y),
    }
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

function findOpenPositionInRadius(
  ctx: SimulationContext,
  center: Vector2,
  radius: number,
  clearance: number,
): Vector2 | null {
  for (let i = 0; i < 24; i++) {
    const candidate = wrapToBounds(ctx, jitter(ctx.rng, center, radius))
    if (!isBlockedByRock(ctx, candidate, clearance)) return candidate
  }
  return null
}
