import { PlantStats } from '../components'
import type { SimulationContext } from '../types'

import { clamp } from '@/utils/math'

const SEASON_TICKS = 2400
const MAX_BIOMASS = 1.6
const MIN_BIOMASS = 0.1
const GROWTH_SCALE = 0.12

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
    const growthBudget = regenRate * nutrientQuality * availableMoisture * GROWTH_SCALE * dt
    const allowedGrowth = Math.min(growthBudget, MAX_BIOMASS - PlantStats.biomass[entity])

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
