import { Intent, ModeState } from '../components'
import type { SimulationContext } from '../types'

const FALLBACK_MODE = 6 // Patrol

export function commitIntentSystem(ctx: SimulationContext) {
  ctx.agents.forEach((entity) => {
    const desiredMode = Intent.mode[entity] || FALLBACK_MODE
    ModeState.mode[entity] = desiredMode
    let desiredTargetType = Intent.targetType[entity]
    let desiredTargetId = Intent.targetId[entity]
    if (desiredTargetType === 1 && !ctx.agents.has(desiredTargetId)) {
      desiredTargetType = 0
      desiredTargetId = 0
      Intent.targetType[entity] = 0
      Intent.targetId[entity] = 0
    } else if (desiredTargetType === 2 && !ctx.plants.has(desiredTargetId)) {
      desiredTargetType = 0
      desiredTargetId = 0
      Intent.targetType[entity] = 0
      Intent.targetId[entity] = 0
    } else if (desiredTargetType === 3 && !ctx.corpses.has(desiredTargetId)) {
      desiredTargetType = 0
      desiredTargetId = 0
      Intent.targetType[entity] = 0
      Intent.targetId[entity] = 0
    }
    ModeState.targetType[entity] = desiredTargetType
    ModeState.targetId[entity] = desiredTargetId
  })
}
