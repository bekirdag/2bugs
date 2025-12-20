import { AgentMeta, DNA, Energy, ModeState, PlantStats, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'

import { distanceSquared } from '@/utils/math'

const MODE = {
  Graze: 2,
  Patrol: 6,
  Sleep: 1,
  Flee: 4,
  Mate: 5,
  Fight: 7,
  Idle: 8,
  Digest: 9,
  Recover: 10,
}

export function grazingSystem(ctx: SimulationContext, curiosityBias = 0) {
  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    if (mode === MODE.Sleep || mode === MODE.Flee || mode === MODE.Mate || mode === MODE.Fight) return
    if (mode !== MODE.Graze && mode !== MODE.Patrol && mode !== MODE.Idle) return
    const genome = ctx.genomes.get(id)
    if (!genome) return
    const archetype = AgentMeta.archetype[entity]
    const curiosity = (genome.curiosity ?? DNA.curiosity[entity] ?? 0) + curiosityBias
    const eatsPlants =
      genome?.preferredFood?.includes('plant') ?? archetype === ArchetypeCode.Prey
    if (!eatsPlants) return

    const hungerThreshold = genome.hungerThreshold
    const hungerLine = hungerThreshold * (genome.grazeHungerBase + curiosity * genome.grazeHungerCuriosityScale)
    const wantsForage =
      Energy.value[entity] < hungerLine ||
      ModeState.mode[entity] === MODE.Graze ||
      curiosity > genome.grazeCuriosityForageThreshold
    if (!wantsForage) return

    const me = { x: Position.x[entity], y: Position.y[entity] }
    const searchRadius = genome.grazeSearchRadiusBase + curiosity * genome.grazeSearchRadiusCuriosityScale
    const buckets = ctx.plantIndex.query(me, searchRadius)
    let bestId = -1
    let bestScore = 0
    buckets.forEach((bucket) => {
      const plantEntity = ctx.plants.get(bucket.id)
      if (plantEntity === undefined) return
      if ((PlantStats.biomass[plantEntity] || 0) <= genome.grazeTargetMinBiomass) return
      const dist = Math.max(
        genome.grazeDistanceFloor,
        Math.sqrt(distanceSquared(me, { x: Position.x[plantEntity], y: Position.y[plantEntity] })),
      )
      const biomass = PlantStats.biomass[plantEntity]
      const nutrients = PlantStats.nutrientDensity[plantEntity]
      const score =
        (biomass * genome.grazeScoreBiomassWeight + nutrients * genome.grazeScoreNutrientWeight) / dist
      if (score > bestScore) {
        bestScore = score
        bestId = bucket.id
      }
    })

    if (bestId !== -1) {
      ModeState.mode[entity] = MODE.Graze
      ModeState.targetType[entity] = 2
      ModeState.targetId[entity] = bestId
    } else if (ModeState.mode[entity] === MODE.Graze) {
      ModeState.mode[entity] = MODE.Patrol
      ModeState.targetType[entity] = 0
      ModeState.targetId[entity] = 0
    }
  })
}
