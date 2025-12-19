import { removeEntity } from 'bitecs'

import { AgentMeta, Corpse, ModeState, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'

import type { Vector2 } from '@/types/sim'
import { depositFertilizer } from '@/ecs/fertilization'
import { CORPSE_STAGE } from '@/ecs/corpseStages'

export function corpseSystem(ctx: SimulationContext, dt: number) {
  const toRemove: number[] = []
  const toFertilize: { id: number; entity: number; nutrients: number; position: Vector2 }[] = []
  const hunterHold = new Set<number>()

  ctx.agents.forEach((entity) => {
    if (AgentMeta.archetype[entity] !== ArchetypeCode.Hunter) return
    if (ModeState.targetType[entity] !== 3) return
    const targetId = ModeState.targetId[entity]
    if (targetId) hunterHold.add(targetId)
  })

  ctx.corpses.forEach((entity, id) => {
    const nutrients = Corpse.nutrients[entity] || 0
    const stage = Corpse.stage[entity] || CORPSE_STAGE.Fresh
    if (stage === CORPSE_STAGE.Fresh) {
      const decayScale = hunterHold.has(id) ? 0.2 : 1
      Corpse.freshTime[entity] = Math.max(0, (Corpse.freshTime[entity] || 0) - dt * decayScale)
      if (Corpse.freshTime[entity] <= 0) {
        Corpse.stage[entity] = CORPSE_STAGE.Dead
        Corpse.freshTime[entity] = 0
      }
    } else {
      Corpse.decay[entity] = (Corpse.decay[entity] || 0) - dt
      if (Corpse.decay[entity] <= 0) {
        if (nutrients > 0.1) {
          toFertilize.push({
            id,
            entity,
            nutrients,
            position: { x: Position.x[entity], y: Position.y[entity] },
          })
        }
        toRemove.push(id)
      }
    }
    if (nutrients <= 0.1) {
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
