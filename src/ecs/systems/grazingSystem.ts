import { AgentMeta, DNA, Energy, ModeState, PlantStats, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'

import { distanceSquared } from '@/utils/math'

const MODE = {
  Graze: 2,
  Patrol: 6,
  Sleep: 1,
  Flee: 4,
}

export function grazingSystem(ctx: SimulationContext, curiosityBias = 0) {
  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    if (mode === MODE.Sleep || mode === MODE.Flee) return
    const genome = ctx.genomes.get(id)
    const archetype = AgentMeta.archetype[entity]
    const curiosity = (DNA.curiosity[entity] ?? 0.3) + curiosityBias
    const eatsPlants =
      genome?.preferredFood?.includes('plant') ??
      (archetype === ArchetypeCode.Prey || (DNA.scavengerAffinity[entity] ?? 0) > 0.25)
    if (!eatsPlants) return

    const hungerThreshold = genome?.hungerThreshold ?? Energy.metabolism[entity] * 8
    const hungerLine = hungerThreshold * (1 + curiosity * 0.4)
    const wantsForage =
      Energy.value[entity] < hungerLine || ModeState.mode[entity] === MODE.Graze || curiosity > 0.55
    if (!wantsForage) return

    const me = { x: Position.x[entity], y: Position.y[entity] }
    const searchRadius = 80 + curiosity * 220
    const buckets = ctx.plantIndex.query(me, searchRadius)
    let bestId = -1
    let bestScore = 0
    buckets.forEach((bucket) => {
      const plantEntity = ctx.plants.get(bucket.id)
      if (plantEntity === undefined) return
      const dist = Math.max(1, Math.sqrt(distanceSquared(me, { x: Position.x[plantEntity], y: Position.y[plantEntity] })))
      const biomass = PlantStats.biomass[plantEntity]
      const nutrients = PlantStats.nutrientDensity[plantEntity]
      const score = (biomass * 0.7 + nutrients * 0.3) / dist
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
