import { removeEntity } from 'bitecs'

import { Corpse, Obstacle, PlantStats, Position } from '../components'
import { spawnPlantEntity } from '../registry'
import type { SimulationContext } from '../types'

import type { PlantDNA, PlantState, Vector2 } from '@/types/sim'
import { clamp } from '@/utils/math'
import { jitter, randItem, randRange } from '@/utils/rand'

export function corpseSystem(ctx: SimulationContext, dt: number, maxPlants: number) {
  const toRemove: number[] = []
  const toFertilize: { id: number; entity: number; nutrients: number; position: Vector2 }[] = []

  ctx.corpses.forEach((entity, id) => {
    const nutrients = Corpse.nutrients[entity] || 0
    if (nutrients <= 0.1) {
      toRemove.push(id)
      return
    }

    Corpse.decay[entity] = (Corpse.decay[entity] || 0) - dt
    if (Corpse.decay[entity] <= 0) {
      toFertilize.push({
        id,
        entity,
        nutrients,
        position: { x: Position.x[entity], y: Position.y[entity] },
      })
      toRemove.push(id)
    }
  })

  toFertilize.forEach((corpse) => fertilizeFromCorpse(ctx, corpse.position, corpse.nutrients, maxPlants))
  toRemove.forEach((id) => removeCorpse(ctx, id))
}

function fertilizeFromCorpse(ctx: SimulationContext, position: Vector2, nutrients: number, maxPlants: number) {
  // Boost nearby plants first (patchy growth).
  const fertilizerRadius = clamp(70 + nutrients * 0.08, 70, 240)
  const nearbyPlants = ctx.plantIndex.query(position, fertilizerRadius)
  nearbyPlants.forEach((bucket) => {
    const plantEntity = ctx.plants.get(bucket.id)
    if (plantEntity === undefined) return
    PlantStats.moisture[plantEntity] = clamp(PlantStats.moisture[plantEntity] + 0.25, 0, 1)
    PlantStats.biomass[plantEntity] = clamp(PlantStats.biomass[plantEntity] + 0.15, 0.1, 1.6)
    PlantStats.regrowthRate[plantEntity] = clamp(PlantStats.regrowthRate[plantEntity] + 0.08, 0.1, 1)
  })

  if (ctx.plants.size >= maxPlants) return

  // Spawn a few new plants around the corpse as fertilizer. Larger corpses yield more sprouts.
  const sprouts = clamp(Math.round(nutrients / 240), 1, 8)
  for (let i = 0; i < sprouts; i++) {
    if (ctx.plants.size >= maxPlants) break
    spawnFertilizerPlant(ctx, position, fertilizerRadius)
  }
}

function spawnFertilizerPlant(ctx: SimulationContext, source: Vector2, radius: number) {
  const id = ctx.nextPlantId++
  const dna: PlantDNA = {
    biomass: randRange(ctx.rng, 0.9, 1.35),
    regrowthRate: randRange(ctx.rng, 0.45, 0.95),
    seedSpread: randRange(ctx.rng, 0.25, 0.9),
    pigment: randItem(ctx.rng, ['#2ab811', '#3dad2a', '#7fe52f']),
    nutrientDensity: randRange(ctx.rng, 0.55, 1),
    thorns: randRange(ctx.rng, 0, 0.35),
    seasonPreference: randRange(ctx.rng, -1, 1),
  }

  const desired = jitter(ctx.rng, source, Math.max(18, radius))
  const position = findOpenPosition(ctx, wrapToBounds(ctx, desired), 10)
  const plant: PlantState = {
    id,
    dna,
    position,
    size: dna.biomass,
    moisture: clamp(randRange(ctx.rng, 0.7, 1.15), 0, 1),
  }

  const entity = spawnPlantEntity(ctx.registry, plant)
  ctx.plants.set(id, entity)
  ctx.plantIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
}

function removeCorpse(ctx: SimulationContext, id: number) {
  const entity = ctx.corpses.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.corpses.delete(id)
  ctx.corpseIndex.delete(id)
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

