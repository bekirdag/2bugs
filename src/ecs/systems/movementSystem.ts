import { DNA, Energy, Heading, ModeState, Position, Velocity } from '../components'
import type { SimulationContext } from '../types'

import { clamp, lerpAngle } from '@/utils/math'

const MODE = {
  Sleep: 1,
  Graze: 2,
  Hunt: 3,
  Flee: 4,
  Patrol: 6,
} as const

export function movementSystem(
  ctx: SimulationContext,
  dt: number,
  speedMultiplier: number,
  curiosityBias = 0,
) {
  const { bounds } = ctx.config
  const step = dt * speedMultiplier

  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    const resting = mode === MODE.Sleep

    const targetPosition = !resting ? resolveTargetPosition(ctx, entity) : null

    if (targetPosition) {
      let desiredHeading = Math.atan2(targetPosition.y - Position.y[entity], targetPosition.x - Position.x[entity])
      if (mode === MODE.Flee) {
        desiredHeading += Math.PI
      }
      const turnAmount = clamp((Heading.turnRate[entity] || DNA.curiosity[entity]) * step, 0, 1)
      Heading.angle[entity] = lerpAngle(Heading.angle[entity], desiredHeading, turnAmount)
    } else if (!resting) {
      const curiosity = clamp((DNA.curiosity[entity] ?? 0.2) + curiosityBias, 0.05, 1)
      const jitter = (ctx.rng() - 0.5) * curiosity * 2
      Heading.angle[entity] += jitter * step
    }

    const stamina = DNA.stamina[entity] ?? 1
    const modeBoost =
      mode === MODE.Flee
        ? 1.2 + stamina * 0.2
        : mode === MODE.Hunt
          ? 1 + stamina * 0.1
          : mode === MODE.Graze
            ? 0.8
            : mode === MODE.Patrol
              ? 1.05
              : 1
    const fatPenalty = 1 / (1 + Energy.fatStore[entity] / Math.max(Energy.fatCapacity[entity], 1))
    let targetSpeed = DNA.baseSpeed[entity] * modeBoost * fatPenalty

    if (resting) {
      targetSpeed = 0
    } else {
      const metabolismNeed = Math.max(Energy.metabolism[entity], 1)
      const energyRatio = clamp(Energy.value[entity] / (metabolismNeed * 2), 0, 1)
      const conserving = energyRatio < 0.4 && mode !== MODE.Flee
      if (conserving) {
        // Exponential drop keeps hungry agents mostly still while never fully freezing in danger.
        targetSpeed *= energyRatio * energyRatio
      }
    }

    Velocity.x[entity] = Math.cos(Heading.angle[entity]) * targetSpeed
    Velocity.y[entity] = Math.sin(Heading.angle[entity]) * targetSpeed

    Position.x[entity] += Velocity.x[entity] * step
    Position.y[entity] += Velocity.y[entity] * step

    if (Position.x[entity] < 0) Position.x[entity] += bounds.x
    if (Position.x[entity] > bounds.x) Position.x[entity] -= bounds.x
    if (Position.y[entity] < 0) Position.y[entity] += bounds.y
    if (Position.y[entity] > bounds.y) Position.y[entity] -= bounds.y

    ctx.agentIndex.set({ x: Position.x[entity], y: Position.y[entity] }, { id, data: id })
  })
}

function resolveTargetPosition(ctx: SimulationContext, entity: number) {
  const targetType = ModeState.targetType[entity]
  const targetId = ModeState.targetId[entity]
  if (!targetType || !targetId) return null
  if (targetType === 1) {
    const targetEntity = ctx.agents.get(targetId)
    if (targetEntity === undefined) {
      ModeState.targetType[entity] = 0
      ModeState.targetId[entity] = 0
      return null
    }
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else {
    const targetEntity = ctx.plants.get(targetId)
    if (targetEntity === undefined) {
      ModeState.targetType[entity] = 0
      ModeState.targetId[entity] = 0
      return null
    }
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  }
}
