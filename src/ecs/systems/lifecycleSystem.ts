import { AgentMeta, Body, Energy } from '../components'
import type { SimulationContext } from '../types'

import { effectiveFatCapacity } from '@/ecs/lifecycle'
import { clamp } from '@/utils/math'

// Keeps mass/fat-derived runtime caps in sync.
// Called early in the tick so movement, interaction, and metabolism see consistent values.
export function lifecycleSystem(ctx: SimulationContext) {
  ctx.agents.forEach((entity) => {
    const id = AgentMeta.id[entity]
    const genome = ctx.genomes.get(id)
    if (!genome) return

    const currentMass = clamp(Body.mass[entity] || genome.bodyMass || 1, 0.2, 80)
    const fatCapacity = effectiveFatCapacity(genome, currentMass)

    Energy.fatCapacity[entity] = fatCapacity
    if (Energy.fatStore[entity] > fatCapacity) {
      Energy.fatStore[entity] = fatCapacity
    }
  })
}

