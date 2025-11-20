import { DNA, Energy, Heading, ModeState, Position, Velocity } from '../components'
import type { SimulationContext } from '../types'

import { clamp, lerpAngle } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'
import { deriveMovementProfile } from '@/ecs/bodyPlan'

const MODE = {
  Sleep: 1,
  Graze: 2,
  Hunt: 3,
  Flee: 4,
  Patrol: 6,
  Fight: 7,
} as const

const FIGHT_HOLD_RADIUS = 20

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
    const targetPosSnapshot = resolveTargetPosition(ctx, entity)
    const distanceToTarget =
      targetPosSnapshot &&
      Math.sqrt(
        (targetPosSnapshot.x - Position.x[entity]) * (targetPosSnapshot.x - Position.x[entity]) +
          (targetPosSnapshot.y - Position.y[entity]) * (targetPosSnapshot.y - Position.y[entity]),
      )
    const holdPosition = mode === MODE.Fight && distanceToTarget !== null && distanceToTarget !== undefined && distanceToTarget <= FIGHT_HOLD_RADIUS

    let targetPosition = !resting ? targetPosSnapshot : null

    const genome = ctx.genomes.get(id)
    const biome = genome?.biome ?? 'land'
    let profile = ctx.locomotion.get(id)
    const needsProfile =
      (featureFlags.landBodyPlan && biome === 'land' && (!profile || !profile.land)) ||
      (featureFlags.aquaticBodyPlan && biome === 'water' && (!profile || !profile.water)) ||
      (featureFlags.aerialBodyPlan && biome === 'air' && (!profile || !profile.air))
    if (needsProfile && genome) {
      profile = deriveMovementProfile(genome.bodyPlan, genome.archetype, biome)
      ctx.locomotion.set(id, profile)
    }
    const landStats = featureFlags.landBodyPlan ? profile?.land : undefined
    const swimStats = featureFlags.aquaticBodyPlan ? profile?.water : undefined
    const flightStats = featureFlags.aerialBodyPlan ? profile?.air : undefined

    let turnFactor = DNA.curiosity[entity] ?? 0.3
    if (biome === 'land' && landStats) {
      turnFactor = clamp(landStats.agility * 1.2, 0.15, 1.5)
    } else if (biome === 'water' && swimStats) {
      turnFactor = clamp(swimStats.turnRate, 0.2, 1.3)
    } else if (biome === 'air' && flightStats) {
      turnFactor = clamp(0.4 + (flightStats.lift + flightStats.glide) * 0.3, 0.3, 1.6)
    }

    // Juvenile bonding: follow parent if within dependency window
    const birthTick = ctx.birthTick.get(id) ?? 0
    const ageTicks = Math.max(0, ctx.tick - birthTick)
    const dependency = genome?.dependency ?? 0
    const independence = genome?.independenceAge ?? 20
    const parentId = ctx.parentMap.get(id)
    if (!resting && dependency > 0.05 && ageTicks < independence && parentId) {
      const parentEntity = ctx.agents.get(parentId)
      if (parentEntity !== undefined) {
        targetPosition = { x: Position.x[parentEntity], y: Position.y[parentEntity] }
        ModeState.mode[entity] = MODE.Patrol
      }
    }

    if (targetPosition) {
      let desiredHeading = Math.atan2(targetPosition.y - Position.y[entity], targetPosition.x - Position.x[entity])
      if (mode === MODE.Flee) {
        desiredHeading += Math.PI
      }
      const turnAmount = clamp((Heading.turnRate[entity] || turnFactor) * step, 0, 1)
      Heading.angle[entity] = lerpAngle(Heading.angle[entity], desiredHeading, turnAmount)
    } else if (!resting) {
      const curiosity = clamp((turnFactor ?? DNA.curiosity[entity] ?? 0.2) + curiosityBias, 0.05, 1)
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
              : mode === MODE.Fight
                ? 0.4
                : 1
    const fatPenalty = 1 / (1 + Energy.fatStore[entity] / Math.max(Energy.fatCapacity[entity], 1))
    let locomotionBonus = 1
    if (biome === 'land' && landStats) {
      locomotionBonus = clamp(0.6 + landStats.strideLength, 0.5, 1.6)
    } else if (biome === 'water' && swimStats) {
      locomotionBonus = clamp(0.5 + swimStats.thrust, 0.4, 1.8)
    } else if (biome === 'air' && flightStats) {
      locomotionBonus = clamp(0.7 + flightStats.lift, 0.6, 2)
    }
    let targetSpeed = DNA.baseSpeed[entity] * locomotionBonus * modeBoost * fatPenalty

    if (resting) {
      targetSpeed = 0
    } else if (holdPosition) {
      targetSpeed = 0
    } else {
      const metabolismNeed = Math.max(Energy.metabolism[entity], 1)
      const energyRatio = clamp(Energy.value[entity] / (metabolismNeed * 2), 0, 1)
      const conserving = energyRatio < 0.4 && mode !== MODE.Flee && !holdPosition
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
