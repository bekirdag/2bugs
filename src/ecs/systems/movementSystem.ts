import { Body, DNA, Energy, Heading, ModeState, Obstacle, Position, Reproduction, Velocity } from '../components'
import type { SimulationContext } from '../types'

import { clamp, lerpAngle } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'
import { deriveMovementProfile } from '@/ecs/bodyPlan'

const MODE = {
  Sleep: 1,
  Graze: 2,
  Hunt: 3,
  Flee: 4,
  Mate: 5,
  Patrol: 6,
  Fight: 7,
} as const

const FIGHT_HOLD_RADIUS = 20

export function movementSystem(
  ctx: SimulationContext,
  dt: number,
  speedMultiplier: number,
  curiosityBias = 0,
  fatSpeedPenalty = 1,
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

    // `turnRate` is a heritable DNA field stored in the genome map (not the bitecs DNA component).
    // We treat it as a base turn multiplier and modulate it with biome/body-plan agility when enabled.
    const baseTurnRate = clamp(genome?.turnRate ?? 1.5, 0.2, 5)
    let turnFactor = baseTurnRate
    if (biome === 'land' && landStats) {
      turnFactor = baseTurnRate * clamp(landStats.agility * 1.2, 0.15, 1.5)
    } else if (biome === 'water' && swimStats) {
      turnFactor = baseTurnRate * clamp(swimStats.turnRate, 0.2, 1.3)
    } else if (biome === 'air' && flightStats) {
      turnFactor =
        baseTurnRate * clamp(0.4 + (flightStats.lift + flightStats.glide) * 0.3, 0.3, 1.6)
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
      const curiosity = clamp((DNA.curiosity[entity] ?? 0.2) + curiosityBias, 0.05, 1)
      const hungerLine = ((genome?.hungerThreshold ?? Energy.metabolism[entity] * 8) + Energy.sleepDebt[entity]) * 1.0
      const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 2)
      const forageStartRatio = clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95)
      const libidoRatio = clamp(
        Reproduction.libido[entity] / Math.max(Reproduction.libidoThreshold[entity] || 0.6, 0.1),
        0,
        2,
      )
      const foodSearching = hungerRatio < forageStartRatio && mode !== MODE.Flee && mode !== MODE.Sleep
      const mateSearching = mode === MODE.Mate && libidoRatio > forageStartRatio
      const activeSearch = (foodSearching || mateSearching) && mode !== MODE.Fight

      // If we have no sensed target but are "in need", widen the random walk so agents actively explore
      // instead of slowly drifting in place.
      const turnJitterScale = activeSearch ? 2.75 : 1
      const jitter = (ctx.rng() - 0.5) * curiosity * 2 * turnJitterScale
      Heading.angle[entity] += jitter * step * clamp(turnFactor, 0.3, 3)

      // Occasionally pick a new random direction to avoid local oscillation when searching.
      if (activeSearch && ctx.rng() < step * (0.18 + curiosity * 0.22)) {
        Heading.angle[entity] = ctx.rng() * Math.PI * 2
      }
    }

    applyRockAvoidance(ctx, entity, step)

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
    const fatCapacity = Math.max(Energy.fatCapacity[entity], 1)
    const fatRatio = clamp(Energy.fatStore[entity] / fatCapacity, 0, 1)
    // Fatter animals move slower. Nonlinear curve makes mild fat less punishing, while very fat becomes meaningfully slower.
    const fatPenalty = clamp(1 - clamp(fatSpeedPenalty, 0, 2) * 0.75 * Math.pow(fatRatio, 0.85), 0.2, 1)
    let locomotionBonus = 1
    if (biome === 'land' && landStats) {
      locomotionBonus = clamp(0.6 + landStats.strideLength, 0.5, 1.6)
    } else if (biome === 'water' && swimStats) {
      locomotionBonus = clamp(0.5 + swimStats.thrust, 0.4, 1.8)
    } else if (biome === 'air' && flightStats) {
      locomotionBonus = clamp(0.7 + flightStats.lift, 0.6, 2)
    }
    // Size → speed: in nature, bigger animals tend to be faster in most cases (more muscle mass),
    // but fat and stamina still matter. Use diminishing returns so large animals don't become absurd.
    const bodyMass = clamp(Body.mass[entity] || genome?.bodyMass || 1, 0.2, 50)
    const sizeSpeedFactor = clamp(Math.pow(bodyMass, 0.35), 0.6, 3.2)
    let targetSpeed = DNA.baseSpeed[entity] * sizeSpeedFactor * locomotionBonus * modeBoost * fatPenalty

    if (resting) {
      targetSpeed = 0
    } else if (holdPosition) {
      targetSpeed = 0
    } else {
      const metabolismNeed = Math.max(Energy.metabolism[entity], 1)
      const energyRatio = clamp(Energy.value[entity] / (metabolismNeed * 2), 0, 1)
      const hungerLine = (genome?.hungerThreshold ?? metabolismNeed * 8) + Energy.sleepDebt[entity]
      const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 2)
      const forageStartRatio = clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95)
      const libidoRatio = clamp(
        Reproduction.libido[entity] / Math.max(Reproduction.libidoThreshold[entity] || 0.6, 0.1),
        0,
        2,
      )
      const isSearching =
        (hungerRatio < forageStartRatio || (mode === MODE.Mate && libidoRatio > forageStartRatio)) &&
        mode !== MODE.Sleep &&
        mode !== MODE.Flee

      const conserving = energyRatio < 0.4 && mode !== MODE.Flee && !holdPosition
      if (conserving) {
        if (isSearching) {
          // Starving animals should still actively search, otherwise they can "freeze" before finding food.
          // Soften the conserve curve and enforce a small minimum search speed.
          targetSpeed *= clamp(0.25 + energyRatio, 0.25, 1)
          const minSearchSpeed =
            DNA.baseSpeed[entity] * sizeSpeedFactor * locomotionBonus * modeBoost * fatPenalty * 0.18
          targetSpeed = Math.max(targetSpeed, minSearchSpeed)
        } else {
          // Exponential drop keeps hungry agents mostly still while never fully freezing in danger.
          targetSpeed *= energyRatio * energyRatio
        }
      }
    }

    Velocity.x[entity] = Math.cos(Heading.angle[entity]) * targetSpeed
    Velocity.y[entity] = Math.sin(Heading.angle[entity]) * targetSpeed

    Position.x[entity] += Velocity.x[entity] * step
    Position.y[entity] += Velocity.y[entity] * step

    resolveRockPenetration(ctx, entity)

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
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else if (targetType === 2) {
    const targetEntity = ctx.plants.get(targetId)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else if (targetType === 3) {
    const targetEntity = ctx.corpses.get(targetId)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  }
  return null
}

function applyRockAvoidance(ctx: SimulationContext, entity: number, step: number) {
  if (ctx.rocks.size === 0) return
  const me = { x: Position.x[entity], y: Position.y[entity] }
  // Rocks are few; iterating them is faster than spatial-hash queries with huge radii (especially with big boulders).

  let pushX = 0
  let pushY = 0
  for (const rockEntity of ctx.rocks.values()) {
    const dx = me.x - Position.x[rockEntity]
    const dy = me.y - Position.y[rockEntity]
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
    const radius = (Obstacle.radius[rockEntity] || 0) + 18
    const influence = radius + 70
    if (dist >= influence) continue
    const strength = clamp((influence - dist) / influence, 0, 1)
    pushX += (dx / dist) * strength
    pushY += (dy / dist) * strength
  }

  const mag = Math.sqrt(pushX * pushX + pushY * pushY)
  if (mag <= 0.0001) return
  const desired = Math.atan2(pushY / mag, pushX / mag)
  const t = clamp(step * 0.9, 0, 1)
  Heading.angle[entity] = lerpAngle(Heading.angle[entity], desired, t)
}

function resolveRockPenetration(ctx: SimulationContext, entity: number) {
  if (ctx.rocks.size === 0) return
  for (const rockEntity of ctx.rocks.values()) {
    const dx = Position.x[entity] - Position.x[rockEntity]
    const dy = Position.y[entity] - Position.y[rockEntity]
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
    const min = (Obstacle.radius[rockEntity] || 0) + 16
    if (dist >= min) continue
    const nx = dx / dist
    const ny = dy / dist
    const overlap = min - dist
    Position.x[entity] += nx * overlap
    Position.y[entity] += ny * overlap
  }
}
