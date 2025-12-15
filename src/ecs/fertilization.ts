import { Obstacle, Position } from './components'
import { spawnFertilizerEntity, spawnPlantEntity } from './registry'
import type { SimulationContext } from './types'

import type { PlantDNA, PlantState, Vector2 } from '@/types/sim'
import { clamp } from '@/utils/math'
import { jitter, randItem, randRange } from '@/utils/rand'

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
  const dna: PlantDNA = {
    biomass: randRange(ctx.rng, 0.8, 1.2),
    regrowthRate: randRange(ctx.rng, 0.3, 0.7),
    seedSpread: randRange(ctx.rng, 0.2, 0.8),
    pigment: randItem(ctx.rng, ['#2ab811', '#3dad2a', '#7fe52f']),
    nutrientDensity: randRange(ctx.rng, 0.4, 1),
    thorns: randRange(ctx.rng, 0, 0.5),
    seasonPreference: randRange(ctx.rng, -1, 1),
  }

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
