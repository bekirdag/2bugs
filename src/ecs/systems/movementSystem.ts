import {
  AngularVelocity,
  Body,
  DNA,
  Energy,
  Fertilizer,
  Heading,
  LocomotionState,
  ModeState,
  Obstacle,
  PlantStats,
  Position,
  Reproduction,
  Velocity,
} from '../components'
import type { SimulationContext } from '../types'

import { clamp, lerpAngle } from '@/utils/math'
import { clampGeneValue } from '@/ecs/genetics'
import { featureFlags } from '@/config/featureFlags'
import { deriveMovementProfile } from '@/ecs/bodyPlan'
import type { DNA as GenomeDNA } from '@/types/sim'

type FootContact = {
  mountX: number
  side: -1 | 1
  legSize: number
  gaitStyle: number
  phaseOffset: number
  planted: boolean
  footX: number
  footY: number
}

type AgentContactState = {
  feet: FootContact[]
  signature: string
}

const contactByWorld = new WeakMap<SimulationContext['world'], Map<number, AgentContactState>>()

type NavState = {
  active: boolean
  detourX: number
  detourY: number
  ttl: number
  clearTime: number
  stuckTime: number
  lastTargetX: number
  lastTargetY: number
  lastDistToTarget: number
}

const navByWorld = new WeakMap<SimulationContext['world'], Map<number, NavState>>()

export type MovementTuning = {
  gaitCadenceScale?: number
  stanceThreshold?: number
  thrustPower?: number
  slipScale?: number
}

function ensureNavState(ctx: SimulationContext, id: number): NavState {
  let perWorld = navByWorld.get(ctx.world)
  if (!perWorld) {
    perWorld = new Map()
    navByWorld.set(ctx.world, perWorld)
  }
  const existing = perWorld.get(id)
  if (existing) return existing
  const next: NavState = {
    active: false,
    detourX: 0,
    detourY: 0,
    ttl: 0,
    clearTime: 0,
    stuckTime: 0,
    lastTargetX: NaN,
    lastTargetY: NaN,
    lastDistToTarget: NaN,
  }
  perWorld.set(id, next)
  return next
}

function buildFootSignature(genome: GenomeDNA) {
  const plan = genome.bodyPlan
  const legs = plan.limbs.filter((limb) => limb.kind === 'leg')
  const parts: string[] = []
  legs.forEach((leg) => {
    const mounts = leg.layout?.mounts ?? []
    const desired = Math.max(0, Math.floor(leg.count))
    for (let i = 0; i < desired; i++) {
      const m = mounts[i]
      const x = m ? m.x : 0
      const s = m ? m.side : i % 2 === 0 ? -1 : 1
      parts.push(`${x.toFixed(3)}:${s}:${leg.size.toFixed(3)}:${leg.gaitStyle.toFixed(3)}`)
    }
  })
  return parts.join('|')
}

function ensureContactState(
  ctx: SimulationContext,
  id: number,
  entity: number,
  genome: GenomeDNA,
  totalLegs: number,
) {
  let perWorld = contactByWorld.get(ctx.world)
  if (!perWorld) {
    perWorld = new Map()
    contactByWorld.set(ctx.world, perWorld)
  }
  const signature = totalLegs <= 0 ? '' : buildFootSignature(genome)
  const existing = perWorld.get(id)
  if (existing && existing.signature === signature) return existing

  const feet: FootContact[] = []
  if (totalLegs > 0) {
    const plan = genome.bodyPlan
    const legs = plan.limbs.filter((limb) => limb.kind === 'leg')
    const tau = Math.PI * 2
    let idx = 0
    for (const leg of legs) {
      const mounts = leg.layout?.mounts ?? []
      const desired = Math.max(0, Math.floor(leg.count))
      for (let i = 0; i < desired; i++) {
        const mount = mounts[i]
        const mountX = clamp(mount ? mount.x : 0, -0.6, 0.6)
        const side: -1 | 1 = mount ? mount.side : (i % 2 === 0 ? -1 : 1)
        const phaseOffset =
          (side > 0 ? 0 : Math.PI) + (idx * (tau / Math.max(1, totalLegs))) + mountX * Math.PI * 0.45
        feet.push({
          mountX,
          side,
          legSize: clamp(leg.size, 0.1, 2),
          gaitStyle: clamp(leg.gaitStyle, 0, 1),
          phaseOffset,
          planted: false,
          footX: Position.x[entity],
          footY: Position.y[entity],
        })
        idx++
      }
    }
  }
  const next: AgentContactState = { feet, signature }
  perWorld.set(id, next)
  return next
}

const MODE = {
  Sleep: 1,
  Graze: 2,
  Hunt: 3,
  Flee: 4,
  Mate: 5,
  Patrol: 6,
  Fight: 7,
  Idle: 8,
  Digest: 9,
  Recover: 10,
} as const

const FIGHT_HOLD_RADIUS = 20
const HOUSING_HOLD_RADIUS = 28
const HOUSING_SEARCH_RADIUS = 280
const OPEN_FIELD_CLEARANCE = 140

export function movementSystem(
  ctx: SimulationContext,
  dt: number,
  speedMultiplier: number,
  curiosityBias = 0,
  fatSpeedPenalty = 1,
  tuning: MovementTuning = {},
) {
  const { bounds } = ctx.config
  const step = dt * speedMultiplier
  const gaitCadenceScale = clamp(tuning.gaitCadenceScale ?? 1, 0, 4)
  const stanceThreshold = clamp(tuning.stanceThreshold ?? 0.52, 0, 1)
  const stanceSinThreshold = clamp(stanceThreshold * 2 - 1, -0.98, 0.98)
  const thrustPower = clamp(tuning.thrustPower ?? 1.25, 0.5, 3)
  const slipScale = clamp(tuning.slipScale ?? 1, 0.25, 3)

  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    let resting =
      mode === MODE.Sleep ||
      mode === MODE.Idle ||
      mode === MODE.Digest ||
      mode === MODE.Recover
    const targetPosSnapshot = resting ? null : resolveTargetPosition(ctx, entity)
    let targetPosition = targetPosSnapshot

    const genome = ctx.genomes.get(id)
    const biome = genome?.biome ?? 'land'
    let housingTarget: { x: number; y: number } | null = null
    if (!targetPosition && (mode === MODE.Sleep || mode === MODE.Idle || mode === MODE.Patrol)) {
      const terrainPreference = clamp(
        genome?.terrainPreference ?? DNA.terrainPreference[entity] ?? 0.5,
        0,
        1,
      )
      housingTarget = resolveHousingTarget(ctx, entity, terrainPreference)
      if (housingTarget) {
        targetPosition = housingTarget
      }
    }
    const distanceToTarget =
      targetPosition &&
      Math.sqrt(
        (targetPosition.x - Position.x[entity]) * (targetPosition.x - Position.x[entity]) +
          (targetPosition.y - Position.y[entity]) * (targetPosition.y - Position.y[entity]),
      )
    let holdPosition =
      mode === MODE.Fight &&
      distanceToTarget !== null &&
      distanceToTarget !== undefined &&
      distanceToTarget <= FIGHT_HOLD_RADIUS
    const housingHold =
      housingTarget &&
      distanceToTarget !== null &&
      distanceToTarget !== undefined &&
      distanceToTarget <= HOUSING_HOLD_RADIUS
    if (housingHold) {
      holdPosition = true
    }
    if (housingTarget && (mode === MODE.Sleep || mode === MODE.Idle)) {
      resting = housingHold
    }
    if (resting && !housingTarget) {
      targetPosition = null
    }
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

    const isLand = biome === 'land' && !!landStats
    let desiredHeading = Heading.angle[entity]

    if (targetPosition) {
      desiredHeading = Math.atan2(
        targetPosition.y - Position.y[entity],
        targetPosition.x - Position.x[entity],
      )
      if (mode === MODE.Flee) desiredHeading += Math.PI
    } else if (!resting) {
      const curiosity = clamp((DNA.curiosity[entity] ?? 0.2) + curiosityBias, 0.05, 1)
      const hungerLine =
        (clampGeneValue('hungerThreshold', genome?.hungerThreshold ?? DNA.hungerThreshold[entity] ?? 0) +
          Energy.sleepDebt[entity]) *
          1.0
      const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 2)
      const forageStartRatio = clampGeneValue('forageStartRatio', genome?.forageStartRatio ?? 0)
      const libidoThreshold = clampGeneValue(
        'libidoThreshold',
        genome?.libidoThreshold ?? Reproduction.libidoThreshold[entity] ?? 0,
      )
      const libidoRatio = libidoThreshold > 0 ? clamp(Reproduction.libido[entity] / libidoThreshold, 0, 2) : 0
      const foodSearching = hungerRatio < forageStartRatio && mode !== MODE.Flee && mode !== MODE.Sleep
      const mateSearchLibidoRatioThreshold = clampGeneValue(
        'mateSearchLibidoRatioThreshold',
        genome?.mateSearchLibidoRatioThreshold ?? 0,
      )
      const mateSearching =
        mode === MODE.Mate && libidoRatio >= mateSearchLibidoRatioThreshold && hungerRatio >= forageStartRatio
      const activeSearch = (foodSearching || mateSearching) && mode !== MODE.Fight

      // If we have no sensed target but are "in need", widen the random walk so agents actively explore
      // instead of slowly drifting in place.
      const mateSearchTurnJitterScale = clampGeneValue(
        'mateSearchTurnJitterScale',
        genome?.mateSearchTurnJitterScale ?? 0,
      )
      const turnJitterScale = mateSearching ? mateSearchTurnJitterScale : activeSearch ? 2.75 : 1
      const jitter = (ctx.rng() - 0.5) * curiosity * 2 * turnJitterScale
      desiredHeading += jitter * step * clamp(turnFactor, 0.3, 3)

      // Occasionally pick a new random direction to avoid local oscillation when searching.
      const mateSearchTurnChanceBase = clampGeneValue(
        'mateSearchTurnChanceBase',
        genome?.mateSearchTurnChanceBase ?? 0,
      )
      const mateSearchTurnChanceCuriosityScale = clampGeneValue(
        'mateSearchTurnChanceCuriosityScale',
        genome?.mateSearchTurnChanceCuriosityScale ?? 0,
      )
      const mateTurnChance = step * (mateSearchTurnChanceBase + curiosity * mateSearchTurnChanceCuriosityScale)
      const forageTurnChance = step * (0.18 + curiosity * 0.22)
      if (mateSearching && ctx.rng() < mateTurnChance) {
        desiredHeading = ctx.rng() * Math.PI * 2
      } else if (activeSearch && ctx.rng() < forageTurnChance) {
        desiredHeading = ctx.rng() * Math.PI * 2
      }
    }

    const stamina = DNA.stamina[entity] ?? 1
    const patrolSpeedMultiplier = clampGeneValue('patrolSpeedMultiplier', genome?.patrolSpeedMultiplier ?? 0)
    const fleeSpeedBoostBase = genome?.fleeSpeedBoostBase ?? 1.2
    const fleeSpeedBoostStaminaScale = genome?.fleeSpeedBoostStaminaScale ?? 0.2
    const modeBoost =
      mode === MODE.Flee
        ? fleeSpeedBoostBase + stamina * fleeSpeedBoostStaminaScale
        : mode === MODE.Hunt
          ? 1 + stamina * 0.1
          : mode === MODE.Graze
            ? 0.8
            : mode === MODE.Patrol
              ? patrolSpeedMultiplier
              : mode === MODE.Fight
                ? 0.4
                : 1
    const fatCapacity = Math.max(Energy.fatCapacity[entity], 1)
    const fatRatio = clamp(Energy.fatStore[entity] / fatCapacity, 0, 1)
    // Fatter animals move slower. Nonlinear curve makes mild fat less punishing, while very fat becomes meaningfully slower.
    const fatPenalty = clamp(1 - clamp(fatSpeedPenalty, 0, 2) * 0.75 * Math.pow(fatRatio, 0.85), 0.2, 1)
    let locomotionBonus = 1
    if (biome === 'land' && landStats) {
      // Land movement is driven by legs: no legs => effectively immobile.
      locomotionBonus = landStats.legCount > 0 ? clamp(0.25 + landStats.strideLength, 0.15, 2.1) : 0
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
      const hungerLine =
        clampGeneValue('hungerThreshold', genome?.hungerThreshold ?? DNA.hungerThreshold[entity] ?? 0) +
        Energy.sleepDebt[entity]
      const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 2)
      const forageStartRatio = clampGeneValue('forageStartRatio', genome?.forageStartRatio ?? 0)
      const libidoThreshold = clampGeneValue(
        'libidoThreshold',
        genome?.libidoThreshold ?? Reproduction.libidoThreshold[entity] ?? 0,
      )
      const libidoRatio = libidoThreshold > 0 ? clamp(Reproduction.libido[entity] / libidoThreshold, 0, 2) : 0
      const mateSearchLibidoRatioThreshold = clampGeneValue(
        'mateSearchLibidoRatioThreshold',
        genome?.mateSearchLibidoRatioThreshold ?? 0,
      )
      const mateSearching =
        mode === MODE.Mate && libidoRatio >= mateSearchLibidoRatioThreshold && hungerRatio >= forageStartRatio
      const isSearching =
        (hungerRatio < forageStartRatio || mateSearching) &&
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

    desiredHeading = applyRockAvoidance(ctx, id, entity, step, targetPosition, targetSpeed, desiredHeading)

    if (isLand) {
      // Physics-like turning: steer toward desiredHeading via angular velocity, with inertia + damping.
      let heading = Heading.angle[entity]
      let omega = AngularVelocity.omega[entity] || 0
      const turnError = angleDiff(desiredHeading, heading)
      const turnStrength = 10 + clamp(turnFactor, 0.2, 5) * 18
      const turnDamping = 8 + clamp(turnFactor, 0.2, 5) * 10
      omega += turnError * turnStrength * step
      omega *= Math.exp(-turnDamping * step)
      const omegaMax = 3 + clamp(turnFactor, 0.2, 5) * 5
      omega = clamp(omega, -omegaMax, omegaMax)
      heading += omega * step
      Heading.angle[entity] = heading
      AngularVelocity.omega[entity] = omega

      const headingCos = Math.cos(heading)
      const headingSin = Math.sin(heading)
      const land = landStats!

      // Land locomotion: per-foot stance geometry (planted feet with reach limits) + impulses.
      const legCount = Math.max(0, land.legCount)
      const traction = clamp(0.35 + legCount * 0.1 + land.agility * 0.45, 0.15, 1.85)

      // Update gait phase (persistent, per-entity).
      const gaitPhase = LocomotionState.gaitPhase[entity] || 0
      const speedRatio = targetSpeed <= 0 ? 0 : clamp(targetSpeed / Math.max(DNA.baseSpeed[entity] || 1, 1), 0, 2)
      const cadenceHz = clamp(
        0.8 + speedRatio * (2.2 + land.agility * 1.6) + Math.min(legCount, 8) * 0.08,
        0.6,
        9,
      ) * gaitCadenceScale
      const nextPhase = gaitPhase + cadenceHz * step * Math.PI * 2
      const tau = Math.PI * 2
      const wrapped = ((nextPhase % tau) + tau) % tau
      LocomotionState.gaitPhase[entity] = wrapped

      // Work in local space (forward/lateral).
      let forward = Velocity.x[entity] * headingCos + Velocity.y[entity] * headingSin
      let lateral = Velocity.x[entity] * -headingSin + Velocity.y[entity] * headingCos

      if (legCount <= 0 || !genome?.bodyPlan) {
        // No legs => come to a stop quickly on land.
        const drag = 1 - Math.exp(-step * 18)
        forward -= forward * drag
        lateral -= lateral * drag
        Velocity.x[entity] = forward * headingCos + lateral * -headingSin
        Velocity.y[entity] = forward * headingSin + lateral * headingCos
      } else {
        const contactState = ensureContactState(ctx, id, entity, genome, legCount)
        const feet = contactState.feet
        const mass = clamp(Body.mass[entity] || genome.bodyMass || 1, 0.2, 80)
        const bodyRadius = clamp(10 + Math.pow(mass, 0.45) * 6, 8, 72)
        const bodyLength = bodyRadius * 2.2
        const bodyWidth = bodyRadius * 1.4

        const stride = clamp(
          bodyLength * (0.12 + speedRatio * 0.26 + land.agility * 0.08),
          bodyLength * 0.05,
          bodyLength * 0.7,
        )
        const swingLerp = 1 - Math.exp(-step * (6 + speedRatio * 14))

        let stanceMean = 0
        let thrustMean = 0
        let plantedCount = 0
        let sumForceX = 0
        let sumForceY = 0
        let sumTorque = 0

        // Update feet (plant in stance, move in swing).
        for (const foot of feet) {
          const hipX = foot.mountX * bodyLength * 0.52
          const hipY = foot.side * bodyWidth * 0.32
          const reach = bodyWidth * (0.38 + foot.legSize * 0.42)
          const touchdownLocalX = hipX + stride * (0.28 + foot.gaitStyle * 0.08)
          const liftoffLocalX = hipX - stride * (0.46 + foot.gaitStyle * 0.14)
          const swingLocalX = hipX + stride * 0.58

          const touchdownWorldX = Position.x[entity] + touchdownLocalX * headingCos - hipY * headingSin
          const touchdownWorldY = Position.y[entity] + touchdownLocalX * headingSin + hipY * headingCos
          const swingWorldX = Position.x[entity] + swingLocalX * headingCos - hipY * headingSin
          const swingWorldY = Position.y[entity] + swingLocalX * headingSin + hipY * headingCos

          const phase = wrapped + foot.phaseOffset
          const phaseWrap = ((phase % tau) + tau) % tau
          const sinPhase = Math.sin(phaseWrap)
          const stance = clamp((sinPhase + 1) / 2, 0, 1)
          const inStance = sinPhase > stanceSinThreshold && phaseWrap < Math.PI && targetSpeed > 0
          stanceMean += stance
          thrustMean += Math.pow(stance, thrustPower)

          // Hip world position for reach tests.
          const hipWorldX = Position.x[entity] + hipX * headingCos - hipY * headingSin
          const hipWorldY = Position.y[entity] + hipX * headingSin + hipY * headingCos

          const dx = hipWorldX - foot.footX
          const dy = hipWorldY - foot.footY
          const dist2 = dx * dx + dy * dy
          const maxReach = Math.max(reach * 1.25, stride * 0.8)
          const overstretched = dist2 > maxReach * maxReach

          if (inStance && !overstretched) {
            if (!foot.planted) {
              foot.footX = touchdownWorldX
              foot.footY = touchdownWorldY
              foot.planted = true
            }
            plantedCount++
          } else {
            foot.planted = false
            foot.footX += (swingWorldX - foot.footX) * swingLerp
            foot.footY += (swingWorldY - foot.footY) * swingLerp
            continue
          }

          // Lateral correction: planted feet resist sideways drift by reach constraint.
          if (foot.planted) {
            const relX = hipWorldX - foot.footX
            const relY = hipWorldY - foot.footY
            const relLat = relX * -headingSin + relY * headingCos
            const absLat = Math.abs(relLat)
            if (absLat > reach) {
              const error = absLat - reach
              const sign = relLat < 0 ? -1 : 1
              const corr = (error / Math.max(step, 0.001)) * (0.12 + traction * 0.08)
              lateral -= sign * corr
            }
          }

          // Contact forces: planted feet try to follow a stance arc (touchdown->liftoff) while resisting slip.
          const stanceStart = clamp(Math.asin(stanceSinThreshold), 0, Math.PI / 2)
          const stanceEnd = Math.PI - stanceStart
          const stanceProgress =
            stanceEnd > stanceStart ? clamp((phaseWrap - stanceStart) / (stanceEnd - stanceStart), 0, 1) : 0.5

          const desiredLocalX = touchdownLocalX + (liftoffLocalX - touchdownLocalX) * stanceProgress
          const desiredLocalY = hipY

          const relWorldX = foot.footX - Position.x[entity]
          const relWorldY = foot.footY - Position.y[entity]
          const footLocalX = relWorldX * headingCos + relWorldY * headingSin
          const footLocalY = -relWorldX * headingSin + relWorldY * headingCos

          const errX = footLocalX - desiredLocalX
          const errY = footLocalY - desiredLocalY

          const vFootX = forward - omega * footLocalY
          const vFootY = lateral + omega * footLocalX

          const strength = (0.55 + foot.legSize * 0.7) * clamp(0.35 + traction * 0.45, 0.2, 1.7)
          const kPos = 28 * strength
          const kVelX = 10 * strength
          const kVelY = 18 * strength

          let forceX = errX * kPos - vFootX * kVelX
          let forceY = errY * kPos - vFootY * kVelY

          const maxForce = mass * (90 + traction * 120) * (0.35 + foot.legSize * 0.5)
          const mag = Math.sqrt(forceX * forceX + forceY * forceY) || 0
          if (mag > maxForce) {
            const s = maxForce / mag
            forceX *= s
            forceY *= s
          }

          sumForceX += forceX
          sumForceY += forceY
          sumTorque += footLocalX * forceY - footLocalY * forceX
        }

        stanceMean = feet.length > 0 ? stanceMean / feet.length : 0
        thrustMean = feet.length > 0 ? thrustMean / feet.length : 0
        const contact = feet.length > 0 ? plantedCount / feet.length : 0

        // Integrate summed contact forces (local frame).
        const ax = sumForceX / Math.max(mass, 0.2)
        const ay = sumForceY / Math.max(mass, 0.2)
        forward += ax * step
        lateral += ay * step

        // Small drive assist toward target speed (gated by contact).
        const drive = 1 - Math.exp(-step * (2 + traction * 4))
        forward += (targetSpeed - forward) * drive * clamp(0.15 + thrustMean * 1.1, 0, 1.7) * clamp(contact, 0, 1)

        // Turn torque from contacts + assist toward desired heading.
        const inertia = mass * bodyRadius * bodyRadius * 0.65
        const turnAssist = angleDiff(desiredHeading, heading)
        const assistTorque = clamp(turnAssist, -1.5, 1.5) * inertia * (8 + traction * 14)
        omega += ((sumTorque + assistTorque) / Math.max(inertia, 1)) * step
        omega *= Math.exp(-step * (7 + traction * 8))
        const omegaCap = (3 + traction * 6) * clamp(turnFactor, 0.2, 5)
        omega = clamp(omega, -omegaCap, omegaCap)
        AngularVelocity.omega[entity] = omega

        // Stronger lateral damping with more planted feet.
        const lateralDamp = 1 - Math.exp(-step * (9 + traction * 14 + contact * 22 + legCount * 0.7))
        lateral -= lateral * lateralDamp

        // Slip clamp: planted feet limit lateral drift. Keep forward mostly unaffected.
        const maxLateral = Math.max(8, Math.abs(forward) * (0.16 + traction * 0.12 + stanceMean * 0.25))
        lateral = clamp(lateral, -maxLateral * slipScale, maxLateral * slipScale)

        // Additional ground drag when not moving.
        if (targetSpeed === 0) {
          const drag = 1 - Math.exp(-step * (18 + traction * 10))
          forward -= forward * drag
          lateral -= lateral * drag
        }

        Velocity.x[entity] = forward * headingCos + lateral * -headingSin
        Velocity.y[entity] = forward * headingSin + lateral * headingCos
      }
    } else {
      const turnAmount = clamp((Heading.turnRate[entity] || turnFactor) * step, 0, 1)
      Heading.angle[entity] = lerpAngle(Heading.angle[entity], desiredHeading, turnAmount)
      const headingCos = Math.cos(Heading.angle[entity])
      const headingSin = Math.sin(Heading.angle[entity])
      Velocity.x[entity] = headingCos * targetSpeed
      Velocity.y[entity] = headingSin * targetSpeed
    }

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

type HousingPreference = 'rock' | 'open' | 'plants' | 'fertilizer'
type SpatialIndex = SimulationContext['rockIndex']

function resolveHousingTarget(
  ctx: SimulationContext,
  entity: number,
  preference: number,
): { x: number; y: number } | null {
  const choice = decodeHousingPreference(preference)
  const me = { x: Position.x[entity], y: Position.y[entity] }
  if (choice === 'rock') {
    const rock = findNearestIndexed(ctx, ctx.rockIndex, ctx.rocks, me, HOUSING_SEARCH_RADIUS)
    if (!rock) return null
    const rockPos = { x: Position.x[rock.entity], y: Position.y[rock.entity] }
    const rockRadius = Obstacle.radius[rock.entity] || 0
    const desired = Math.max(rockRadius + 18, 26)
    return wrapToBounds(ctx, offsetFromCenter(ctx, rockPos, me, desired))
  }
  if (choice === 'plants') {
    const plant = findNearestIndexed(
      ctx,
      ctx.plantIndex,
      ctx.plants,
      me,
      HOUSING_SEARCH_RADIUS,
      (plantEntity) => (PlantStats.biomass[plantEntity] || 0) > 0.1,
    )
    if (!plant) return null
    const plantPos = { x: Position.x[plant.entity], y: Position.y[plant.entity] }
    return wrapToBounds(ctx, offsetFromCenter(ctx, plantPos, me, 24))
  }
  if (choice === 'fertilizer') {
    const fertilizer = findNearestIndexed(
      ctx,
      ctx.fertilizerIndex,
      ctx.fertilizers,
      me,
      HOUSING_SEARCH_RADIUS,
      (fertilizerEntity) => (Fertilizer.nutrients[fertilizerEntity] || 0) > 0.1,
    )
    if (!fertilizer) return null
    const fertilizerPos = { x: Position.x[fertilizer.entity], y: Position.y[fertilizer.entity] }
    const radius = Math.max(Fertilizer.radius[fertilizer.entity] || 0, 18)
    const desired = Math.max(18, radius * 0.6)
    return wrapToBounds(ctx, offsetFromCenter(ctx, fertilizerPos, me, desired))
  }

  const nearest = findNearestTerrain(ctx, me, HOUSING_SEARCH_RADIUS)
  if (!nearest) return null
  const dist = Math.sqrt(nearest.distSq)
  if (dist >= OPEN_FIELD_CLEARANCE) return null
  const dx = me.x - nearest.position.x
  const dy = me.y - nearest.position.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const push = OPEN_FIELD_CLEARANCE - dist + 18
  return wrapToBounds(ctx, { x: me.x + (dx / len) * push, y: me.y + (dy / len) * push })
}

function decodeHousingPreference(value: number): HousingPreference {
  if (value < 0.25) return 'rock'
  if (value < 0.5) return 'open'
  if (value < 0.75) return 'plants'
  return 'fertilizer'
}

function findNearestTerrain(
  ctx: SimulationContext,
  position: { x: number; y: number },
  radius: number,
): { position: { x: number; y: number }; distSq: number } | null {
  const rock = findNearestIndexed(ctx, ctx.rockIndex, ctx.rocks, position, radius)
  const plant = findNearestIndexed(ctx, ctx.plantIndex, ctx.plants, position, radius)
  const fertilizer = findNearestIndexed(ctx, ctx.fertilizerIndex, ctx.fertilizers, position, radius)
  let best: { position: { x: number; y: number }; distSq: number } | null = null
  ;[rock, plant, fertilizer].forEach((result) => {
    if (!result) return
    const pos = { x: Position.x[result.entity], y: Position.y[result.entity] }
    if (!best || result.distSq < best.distSq) {
      best = { position: pos, distSq: result.distSq }
    }
  })
  return best
}

function findNearestIndexed(
  ctx: SimulationContext,
  index: SpatialIndex,
  map: Map<number, number>,
  position: { x: number; y: number },
  radius: number,
  predicate?: (entity: number) => boolean,
): { id: number; entity: number; distSq: number } | null {
  if (map.size === 0) return null
  const candidates = index.query(position, radius)
  let bestId: number | null = null
  let bestEntity: number | null = null
  let bestDist = Infinity
  candidates.forEach((bucket) => {
    const candidateEntity = map.get(bucket.id)
    if (candidateEntity === undefined) return
    if (predicate && !predicate(candidateEntity)) return
    const dx = Position.x[candidateEntity] - position.x
    const dy = Position.y[candidateEntity] - position.y
    const distSq = dx * dx + dy * dy
    if (distSq <= radius * radius && distSq < bestDist) {
      bestDist = distSq
      bestId = bucket.id
      bestEntity = candidateEntity
    }
  })
  return bestId !== null && bestEntity !== null ? { id: bestId, entity: bestEntity, distSq: bestDist } : null
}

function offsetFromCenter(
  ctx: SimulationContext,
  center: { x: number; y: number },
  current: { x: number; y: number },
  desiredRadius: number,
): { x: number; y: number } {
  const dx = current.x - center.x
  const dy = current.y - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 0.001) {
    const scale = desiredRadius / dist
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }
  const angle = ctx.rng() * Math.PI * 2
  return { x: center.x + Math.cos(angle) * desiredRadius, y: center.y + Math.sin(angle) * desiredRadius }
}

function wrapToBounds(ctx: SimulationContext, position: { x: number; y: number }) {
  const { x: w, y: h } = ctx.config.bounds
  return {
    x: ((position.x % w) + w) % w,
    y: ((position.y % h) + h) % h,
  }
}

function angleDiff(a: number, b: number) {
  const d = a - b
  return Math.atan2(Math.sin(d), Math.cos(d))
}

function segmentClosestT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  const abx = bx - ax
  const aby = by - ay
  const abLen2 = abx * abx + aby * aby
  if (abLen2 <= 1e-6) return 0
  return clamp(((cx - ax) * abx + (cy - ay) * aby) / abLen2, 0, 1)
}

function segmentDist2ToPoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  const t = segmentClosestT(ax, ay, bx, by, cx, cy)
  const px = ax + (bx - ax) * t
  const py = ay + (by - ay) * t
  const dx = cx - px
  const dy = cy - py
  return { t, dist2: dx * dx + dy * dy }
}

function applyRockAvoidance(
  ctx: SimulationContext,
  id: number,
  entity: number,
  step: number,
  targetPosition: { x: number; y: number } | null,
  targetSpeed: number,
  heading: number,
): number {
  if (ctx.rocks.size === 0) return heading
  const meX = Position.x[entity]
  const meY = Position.y[entity]
  // Rocks are few; iterating them is faster than spatial-hash queries with huge radii (especially with big boulders).

  const bodyMass = clamp(Body.mass[entity] || 1, 0.2, 80)
  const bodyRadius = clamp(10 + Math.pow(bodyMass, 0.45) * 6, 8, 72)
  const clearance = bodyRadius + 18

  const nav = ensureNavState(ctx, id)
  const baseHeading = heading
  let desiredHeading = heading

  const segmentBlocked = (ax: number, ay: number, bx: number, by: number, ignoreRock?: number) => {
    for (const rockEntity of ctx.rocks.values()) {
      if (ignoreRock !== undefined && rockEntity === ignoreRock) continue
      const cx = Position.x[rockEntity]
      const cy = Position.y[rockEntity]
      const r = (Obstacle.radius[rockEntity] || 0) + clearance
      const { dist2 } = segmentDist2ToPoint(ax, ay, bx, by, cx, cy)
      if (dist2 <= r * r) return true
    }
    return false
  }

  const findBlockingRock = (ax: number, ay: number, bx: number, by: number) => {
    let bestRock: number | null = null
    let bestAlong = Infinity
    const abx = bx - ax
    const aby = by - ay
    const segLen = Math.sqrt(abx * abx + aby * aby) || 0.001
    for (const rockEntity of ctx.rocks.values()) {
      const cx = Position.x[rockEntity]
      const cy = Position.y[rockEntity]
      const r = (Obstacle.radius[rockEntity] || 0) + clearance
      const { t, dist2 } = segmentDist2ToPoint(ax, ay, bx, by, cx, cy)
      if (dist2 > r * r) continue
      const along = t * segLen
      if (along < bestAlong) {
        bestAlong = along
        bestRock = rockEntity
      }
    }
    return bestRock
  }

  const pickDetour = (targetX: number, targetY: number) => {
    const distToTarget = Math.sqrt((targetX - meX) * (targetX - meX) + (targetY - meY) * (targetY - meY)) || 0.001
    const maxSeg = Math.min(distToTarget, 680)
    const segEndX = meX + ((targetX - meX) / distToTarget) * maxSeg
    const segEndY = meY + ((targetY - meY) / distToTarget) * maxSeg
    const blocking = findBlockingRock(meX, meY, segEndX, segEndY)
    if (blocking === null) return null

    const cx = Position.x[blocking]
    const cy = Position.y[blocking]
    const rockR = (Obstacle.radius[blocking] || 0) + clearance
    const buffer = clamp(54 + targetSpeed * 0.06, 54, 120)
    const detourRadius = rockR + buffer

    const fromRock = Math.atan2(meY - cy, meX - cx)
    const offsets = [
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI / 3,
      -Math.PI / 3,
      (2 * Math.PI) / 3,
      -(2 * Math.PI) / 3,
      Math.PI * 0.9,
      -Math.PI * 0.9,
    ]

    let best: { x: number; y: number; score: number } | null = null
    for (const offset of offsets) {
      const a = fromRock + offset
      const x = cx + Math.cos(a) * detourRadius
      const y = cy + Math.sin(a) * detourRadius

      const h = Math.atan2(y - meY, x - meX)
      const turnPenalty = Math.abs(angleDiff(h, baseHeading)) * 0.35
      const toDetour = Math.sqrt((x - meX) * (x - meX) + (y - meY) * (y - meY))
      const detourToTarget = Math.sqrt((targetX - x) * (targetX - x) + (targetY - y) * (targetY - y))
      let score = detourToTarget + toDetour * 0.25 + turnPenalty * 140

      // Penalize paths that immediately clip other rocks.
      if (segmentBlocked(meX, meY, x, y, blocking)) score += 900
      if (segmentBlocked(x, y, targetX, targetY, blocking)) score += 520

      // Prefer detours that do not go "behind" us relative to the target.
      const toTargetHx = (targetX - meX) / distToTarget
      const toTargetHy = (targetY - meY) / distToTarget
      const toDetourHx = (x - meX) / Math.max(toDetour, 0.001)
      const toDetourHy = (y - meY) / Math.max(toDetour, 0.001)
      const forward = clamp(toTargetHx * toDetourHx + toTargetHy * toDetourHy, -1, 1)
      score += (1 - forward) * 160

      if (!best || score < best.score) best = { x, y, score }
    }

    return best ? { detourX: best.x, detourY: best.y, rock: blocking } : null
  }

  // If a rock blocks the direct segment to the target, pick a detour point around it.
  if (targetPosition) {
    const tx = targetPosition.x
    const ty = targetPosition.y
    const dxT = tx - meX
    const dyT = ty - meY
    const distToTarget = Math.sqrt(dxT * dxT + dyT * dyT) || 0.001

    const targetMoved =
      !Number.isFinite(nav.lastTargetX) ||
      Math.abs(nav.lastTargetX - tx) + Math.abs(nav.lastTargetY - ty) > 6
    if (targetMoved) {
      nav.active = false
      nav.ttl = 0
      nav.clearTime = 0
      nav.stuckTime = 0
      nav.lastDistToTarget = distToTarget
      nav.lastTargetX = tx
      nav.lastTargetY = ty
    }

    const clearDirect = !segmentBlocked(meX, meY, tx, ty)

    // Maintain detour until direct line stays clear briefly.
    if (nav.active) {
      nav.ttl = Math.max(0, nav.ttl - step)
      if (clearDirect) {
        nav.clearTime += step
      } else {
        nav.clearTime = 0
      }

      const progress = nav.lastDistToTarget - distToTarget
      if (progress < 0.25) {
        nav.stuckTime += step
      } else {
        nav.stuckTime = 0
      }
      nav.lastDistToTarget = distToTarget

      const detourDx = nav.detourX - meX
      const detourDy = nav.detourY - meY
      const detourDist = Math.sqrt(detourDx * detourDx + detourDy * detourDy)
      const reachedDetour = detourDist <= clearance + 18

      if (nav.ttl <= 0 || nav.clearTime >= 0.35 || reachedDetour) {
        nav.active = false
        nav.ttl = 0
        nav.clearTime = 0
        nav.stuckTime = 0
      }
    }

    // Start or refresh a detour if blocked or stuck.
    if (!clearDirect && (!nav.active || nav.stuckTime >= 1.0)) {
      const detour = pickDetour(tx, ty)
      if (detour) {
        nav.active = true
        nav.detourX = detour.detourX
        nav.detourY = detour.detourY
        nav.ttl = 3.25
        nav.clearTime = 0
        nav.stuckTime = 0
      }
    }

    const goalX = nav.active ? nav.detourX : tx
    const goalY = nav.active ? nav.detourY : ty
    desiredHeading = Math.atan2(goalY - meY, goalX - meX)
  }

  // Otherwise, apply a soft steering field that blends repulsion with tangential flow around nearby rocks.
  const headCos = Math.cos(desiredHeading)
  const headSin = Math.sin(desiredHeading)
  let pushX = 0
  let pushY = 0
  let tangX = 0
  let tangY = 0
  for (const rockEntity of ctx.rocks.values()) {
    const rx = Position.x[rockEntity]
    const ry = Position.y[rockEntity]
    const dx = meX - rx
    const dy = meY - ry
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
    const radius = (Obstacle.radius[rockEntity] || 0) + clearance - 4
    const influence = radius + 110 + clamp(targetSpeed * 0.08, 0, 110)
    if (dist >= influence) continue
    const strength = clamp((influence - dist) / influence, 0, 1)

    // Weight more strongly if the rock is in front of the agent.
    const toRockX = -dx / dist
    const toRockY = -dy / dist
    const front = clamp(toRockX * headCos + toRockY * headSin, 0, 1)
    const w = strength * (0.55 + front * 0.95)
    pushX += (dx / dist) * w
    pushY += (dy / dist) * w

    // Tangential component to encourage going around rather than fully reversing.
    const side = headCos * toRockY - headSin * toRockX
    const sign = side >= 0 ? 1 : -1
    tangX += (-toRockY * sign) * w * front
    tangY += (toRockX * sign) * w * front
  }

  const steerX = headCos + pushX * 1.05 + tangX * 0.75
  const steerY = headSin + pushY * 1.05 + tangY * 0.75
  const mag = Math.sqrt(steerX * steerX + steerY * steerY)
  if (mag <= 0.0001) return heading
  const desired = Math.atan2(steerY / mag, steerX / mag)
  const steerRate = nav.active ? 1.35 : 0.95
  return lerpAngle(heading, desired, clamp(step * steerRate, 0, 1))
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
