import { Fertilizer, PlantStats, Position } from '../components'
import { removeEntity } from 'bitecs'
import type { SimulationContext } from '../types'

import { clamp } from '@/utils/math'

const SEASON_TICKS = 2400
const MAX_BIOMASS = 1.6
const MIN_BIOMASS = 0.1
const GROWTH_SCALE = 0.12
const FERTILIZER_GROWTH_MULTIPLIER = 10
const FERTILIZER_COST_PER_BIOMASS = 320 // nutrient units per 1.0 biomass of accelerated growth

export function plantGrowthSystem(ctx: SimulationContext, dt: number) {
  const phase = ((ctx.tick % SEASON_TICKS) / SEASON_TICKS) * Math.PI * 2
  const season = Math.sin(phase)
  const plantCount = Math.max(ctx.plants.size, 1)

  let totalBiomass = 0
  ctx.plants.forEach((entity) => {
    totalBiomass += PlantStats.biomass[entity]
  })
  const averageBiomass = totalBiomass / plantCount
  const overgrazedPressure = clamp(1 - averageBiomass / 1.1, 0, 0.95)
  const droughtFactor = 1 - overgrazedPressure * 0.75

  ctx.plants.forEach((entity) => {
    const sway = (ctx.rng() - 0.5) * 0.02 * dt
    const preference = PlantStats.seasonPhase[entity] ?? 0
    const alignment = 1 - Math.min(1, Math.abs(season - preference))
    const seasonalBoost = 0.35 + alignment * 0.65
    const nutrientQuality = PlantStats.nutrientDensity[entity] * 0.6 + 0.4
    const regenRate = PlantStats.regrowthRate[entity] * seasonalBoost
    const availableMoisture = clamp(PlantStats.moisture[entity] + sway, 0, 1)
    const baseBudget = regenRate * nutrientQuality * availableMoisture * GROWTH_SCALE * dt
    const baseGrowth = Math.min(baseBudget, MAX_BIOMASS - PlantStats.biomass[entity])

    // Fertilizer phase: persistent soil nutrients accelerate growth up to 10×.
    // Plants consume fertilizer mass as they realize this accelerated growth.
    let extraGrowth = 0
    const fertilizer = findNearbyFertilizer(ctx, entity)
    if (fertilizer) {
      const [fertilizerId, fertilizerEntity] = fertilizer
      const remainingCapacity = MAX_BIOMASS - (PlantStats.biomass[entity] + baseGrowth)
      if (remainingCapacity > 0) {
        const extraBudget = baseBudget * (FERTILIZER_GROWTH_MULTIPLIER - 1)
        const desiredExtra = Math.min(extraBudget, remainingCapacity)
        const available = Fertilizer.nutrients[fertilizerEntity] || 0
        const affordable = available / Math.max(FERTILIZER_COST_PER_BIOMASS, 1)
        extraGrowth = Math.min(desiredExtra, affordable)
        if (extraGrowth > 0) {
          Fertilizer.nutrients[fertilizerEntity] = Math.max(
            0,
            available - extraGrowth * FERTILIZER_COST_PER_BIOMASS,
          )
          if (Fertilizer.nutrients[fertilizerEntity] <= 0.1) {
            removeFertilizer(ctx, fertilizerId)
          }
        }
      }
    }

    const allowedGrowth = baseGrowth + extraGrowth

    PlantStats.biomass[entity] = clamp(
      PlantStats.biomass[entity] + allowedGrowth,
      MIN_BIOMASS,
      MAX_BIOMASS,
    )

    const rainfall = (0.025 + Math.max(season, 0) * 0.03) * droughtFactor * dt
    const moistureUse = allowedGrowth * 0.65 + overgrazedPressure * 0.03
    PlantStats.moisture[entity] = clamp(
      availableMoisture + rainfall - moistureUse,
      0,
      1,
    )
  })
}

function findNearbyFertilizer(ctx: SimulationContext, plantEntity: number): [number, number] | null {
  if (ctx.fertilizers.size === 0) return null
  const position = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
  // Cap query radius to the maximum fertilizer radius.
  const candidates = ctx.fertilizerIndex.query(position, 240)
  let bestId: number | null = null
  let bestEntity: number | null = null
  let bestScore = -Infinity
  candidates.forEach((bucket) => {
    const fertilizerEntity = ctx.fertilizers.get(bucket.id)
    if (fertilizerEntity === undefined) return
    const nutrients = Fertilizer.nutrients[fertilizerEntity] || 0
    if (nutrients <= 0.1) return
    const radius = Fertilizer.radius[fertilizerEntity] || 0
    const dx = Position.x[fertilizerEntity] - position.x
    const dy = Position.y[fertilizerEntity] - position.y
    const distSq = dx * dx + dy * dy
    if (distSq > radius * radius) return
    // Prefer closer + richer fertilizer patches.
    const score = nutrients - distSq * 0.02
    if (score > bestScore) {
      bestScore = score
      bestId = bucket.id
      bestEntity = fertilizerEntity
    }
  })
  return bestId !== null && bestEntity !== null ? [bestId, bestEntity] : null
}

function removeFertilizer(ctx: SimulationContext, id: number) {
  const entity = ctx.fertilizers.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.fertilizers.delete(id)
  ctx.fertilizerIndex.delete(id)
}
