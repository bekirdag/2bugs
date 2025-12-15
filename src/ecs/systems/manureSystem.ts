import { removeEntity } from 'bitecs'

import { AgentMeta, Body, Digestion, Energy, Manure, Position } from '../components'
import { spawnManureEntity } from '../registry'
import type { SimulationContext } from '../types'

import { depositFertilizer } from '@/ecs/fertilization'
import { clamp } from '@/utils/math'

const MAX_MANURE_RADIUS = 90
const FERTILIZER_RADIUS_MULTIPLIER = 4

export function manureSystem(ctx: SimulationContext, dt: number) {
  // Decay manure piles; when fully decayed they fertilize the soil and disappear.
  const toRemove: number[] = []
  const toFertilize: { id: number; entity: number; nutrients: number }[] = []
  ctx.manures.forEach((entity, id) => {
    const nutrients = Manure.nutrients[entity] || 0
    if (nutrients <= 0.1) {
      toRemove.push(id)
      return
    }
    Manure.decay[entity] = (Manure.decay[entity] || 0) - dt
    if (Manure.decay[entity] <= 0) {
      toFertilize.push({ id, entity, nutrients })
      toRemove.push(id)
    }
  })
  // Manure dissolves into a persistent fertilizer patch.
  toFertilize.forEach((pile) =>
    depositFertilizer(
      ctx,
      { x: Position.x[pile.entity], y: Position.y[pile.entity] },
      pile.nutrients,
      Math.max(8, (Manure.radius[pile.entity] || 6) * FERTILIZER_RADIUS_MULTIPLIER),
    ),
  )
  toRemove.forEach((id) => removeManure(ctx, id))

  // Track digestion and spawn new manure from living agents.
  const recentDecay = Math.exp(-dt * 0.7)
  const maxDropsPerTick = 2
  ctx.agents.forEach((entity) => {
    const id = AgentMeta.id[entity]
    const genome = ctx.genomes.get(id)
    const bodyMass = clamp(Body.mass[entity] || genome?.bodyMass || (Energy.fatCapacity[entity] || 120) / 120, 0.2, 80)

    Digestion.recentIntake[entity] = (Digestion.recentIntake[entity] || 0) * recentDecay
    let intake = Digestion.intakeSinceManure[entity] || 0
    if (intake <= 0) return

    const threshold = 260 + bodyMass * 220
    let drops = 0
    while (intake >= threshold && drops < maxDropsPerTick) {
      drops += 1
      intake -= threshold
      const recentRatio = clamp((Digestion.recentIntake[entity] || 0) / threshold, 0.15, 2.5)

      const rawNutrients = threshold * (0.22 + 0.08 * recentRatio)
      const nutrients = clamp(rawNutrients, 20, 3200)

      const radius = clamp(4 + bodyMass * 0.9 + Math.sqrt(nutrients) * 0.12, 4, MAX_MANURE_RADIUS)

      // Manure dissolves ~10× faster than a corpse of similar size.
      const corpseEquivalent = clamp(120 + bodyMass * 18, 90, 1800) // seconds
      const maxDecay = clamp(corpseEquivalent / 10, 6, 180)

      const manureId = ctx.nextManureId++
      const manureEntity = spawnManurePile(ctx, manureId, {
        x: Position.x[entity] + (ctx.rng() - 0.5) * 10,
        y: Position.y[entity] + (ctx.rng() - 0.5) * 10,
      }, radius, nutrients, maxDecay)
      if (manureEntity !== null) {
        // After dropping, the "recent intake" pressure is partially relieved.
        Digestion.recentIntake[entity] = (Digestion.recentIntake[entity] || 0) * 0.6
      }
    }

    Digestion.intakeSinceManure[entity] = intake
  })
}

function spawnManurePile(
  ctx: SimulationContext,
  id: number,
  position: { x: number; y: number },
  radius: number,
  nutrients: number,
  maxDecay: number,
): number | null {
  const e = spawnManureEntity(ctx.registry, {
    position: wrapToBounds(ctx, position),
    radius,
    nutrients,
    decay: maxDecay,
    maxDecay,
  })
  ctx.manures.set(id, e)
  ctx.manureIndex.set({ x: Position.x[e], y: Position.y[e] }, { id, data: id })
  return e
}

function removeManure(ctx: SimulationContext, id: number) {
  const entity = ctx.manures.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.manures.delete(id)
  ctx.manureIndex.delete(id)
}

function wrapToBounds(ctx: SimulationContext, position: { x: number; y: number }) {
  const { x: w, y: h } = ctx.config.bounds
  return {
    x: ((position.x % w) + w) % w,
    y: ((position.y % h) + h) % h,
  }
}
