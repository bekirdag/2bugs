import { removeEntity } from 'bitecs'

import { Corpse, Position } from '../components'
import type { SimulationContext } from '../types'

import type { Vector2 } from '@/types/sim'
import { depositFertilizer } from '@/ecs/fertilization'

export function corpseSystem(ctx: SimulationContext, dt: number) {
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

  // Corpse dissolves into a persistent fertilizer patch (not a one-shot effect).
  toFertilize.forEach((corpse) =>
    depositFertilizer(ctx, corpse.position, corpse.nutrients, Math.max(16, (Corpse.radius[corpse.entity] || 14) * 4)),
  )
  toRemove.forEach((id) => removeCorpse(ctx, id))
}

function removeCorpse(ctx: SimulationContext, id: number) {
  const entity = ctx.corpses.get(id)
  if (entity !== undefined) {
    removeEntity(ctx.world, entity)
  }
  ctx.corpses.delete(id)
  ctx.corpseIndex.delete(id)
}
