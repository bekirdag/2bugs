import {
  AgentMeta,
  Body,
  Corpse,
  PlantStats,
  Digestion,
  DNA,
  Energy,
  Heading,
  Intent,
  ModeState,
  Mood,
  Position,
  ArchetypeCode,
  Reproduction,
  Obstacle,
} from '../components'
import { applyBehaviourIntent } from '../mood/behaviorEngine'
import { resolveMood, type MoodMachineInput } from '../mood/moodMachine'
import { decodeMoodKind, encodeMoodKind, encodeMoodTier } from '../mood/moodCatalog'
import type { SimulationContext } from '../types'
import type { ControlState, TargetRef, DNA as GenomeDNA } from '@/types/sim'
import { clamp, distanceSquared } from '@/utils/math'
import { clampGeneValue } from '@/ecs/genetics'
import { corpseEdibleByStage } from '@/ecs/corpseStages'

function rad(deg: number) {
  return (deg * Math.PI) / 180
}

function detectionChance(
  headingCos: number,
  headingSin: number,
  dx: number,
  dy: number,
  dist: number,
  maxDist: number,
  awarenessGene: number,
  targetCamo: number,
  cosHalfFov: number,
) {
  // Within a very small radius, assume detection (touch/hearing).
  if (dist <= 18) return 1

  // Use dot products instead of atan2/angle wrapping:
  // dot = cos(angleDiff) in [-1, 1]
  const inv = 1 / Math.max(dist, 0.001)
  const dirX = dx * inv
  const dirY = dy * inv
  const dot = dirX * headingCos + dirY * headingSin
  // Strict directional vision: if the target is outside the eye's FOV, it is not seen at all.
  const fovFactor = dot >= cosHalfFov ? 1 : 0

  const distFactor = clamp(1 - dist / Math.max(maxDist, 1), 0, 1)
  const awarenessFactor = clamp(0.65 + awarenessGene * 0.7, 0.4, 1.35)
  const camoFactor = clamp(1 - clamp(targetCamo, 0, 1) * 0.6, 0.2, 1)

  return clamp((0.1 + distFactor * 0.9) * fovFactor * awarenessFactor * camoFactor, 0, 1)
}

type SenseProfile = {
  visualRange: number
  senseRange: number
  hearingRange: number
  smellRange: number
  // Eye direction vectors in world space (already includes current heading).
  eyeDirs: { cos: number; sin: number }[]
  cosHalfEyeFov: number
  earDirs: { cos: number; sin: number }[]
  cosHalfEarFov: number
  earSideHints: number[]
  noseDirs: { cos: number; sin: number }[]
  cosHalfNoseFov: number
  noseForwardBias: number
  headingCos: number
  headingSin: number
  hasAnySense: boolean
}

function buildSenseProfile(
  genome: GenomeDNA | undefined,
  archetype: string,
  awarenessGene: number,
  heading: number,
  visualGeneRange: number,
): SenseProfile {
  const plan = genome?.bodyPlan
  const senses = plan?.senses ?? []
  let eyeCount = 0
  let earCount = 0
  let noseCount = 0
  let touchCount = 0
  let earAcuitySum = 0
  let noseAcuitySum = 0

  const eyeAngles: number[] = []
  const earAngles: number[] = []
  const earSideHints: number[] = []
  const noseAngles: number[] = []
  const noseX: number[] = []
  senses.forEach((sense) => {
    if (sense.count <= 0) return
    if (sense.sense === 'eye') {
      eyeCount += sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          eyeAngles.push(angle)
        }
      }
      // If a gene predates layouts, approximate a forward-facing default.
      while (eyeAngles.length < eyeCount) {
        eyeAngles.push(0)
      }
    } else if (sense.sense === 'ear') {
      earCount += sense.count
      earAcuitySum += sense.acuity * sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        const y = placements[i]?.y
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          earAngles.push(angle)
        }
        if (typeof y === 'number' && Number.isFinite(y)) {
          earSideHints.push(y === 0 ? 0 : y < 0 ? -1 : 1)
        }
      }
      while (earAngles.length < earCount) {
        // Default to lateral "coverage" if missing.
        earAngles.push(earAngles.length % 2 === 0 ? -Math.PI / 2 : Math.PI / 2)
        earSideHints.push(earSideHints.length % 2 === 0 ? -1 : 1)
      }
    } else if (sense.sense === 'nose') {
      noseCount += sense.count
      noseAcuitySum += sense.acuity * sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        const x = placements[i]?.x
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          noseAngles.push(angle)
        }
        if (typeof x === 'number' && Number.isFinite(x)) {
          noseX.push(x)
        }
      }
      while (noseAngles.length < noseCount) {
        noseAngles.push(0)
        noseX.push(0.45)
      }
    } else if (sense.sense === 'touch') {
      touchCount += sense.count
    }
  })

  const hasAnySense = eyeCount + earCount + noseCount + touchCount > 0

  const visualRange = eyeCount > 0 ? visualGeneRange : 0

  const avgEarAcuity = earCount > 0 ? earAcuitySum / earCount : 0.5
  const avgNoseAcuity = noseCount > 0 ? noseAcuitySum / noseCount : 0.5
  const awarenessFactor = 0.85 + clamp(awarenessGene, 0, 1) * 0.3
  const hearingRange =
    earCount <= 0 ? 0 : clamp((70 + earCount * 45 * (0.65 + avgEarAcuity * 0.7)) * awarenessFactor, 24, 360)
  const smellRange =
    noseCount <= 0 ? 0 : clamp((60 + noseCount * 50 * (0.65 + avgNoseAcuity * 0.7)) * awarenessFactor, 24, 420)

  const perEyeFov = archetype === 'hunter' ? rad(110) : rad(140)
  const eyeFov = clamp(perEyeFov * (0.8 + clamp(awarenessGene, 0, 1) * 0.5), rad(55), rad(175))
  const cosHalfEyeFov = Math.cos(eyeFov / 2)
  const eyeDirs =
    eyeCount <= 0
      ? []
      : eyeAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const earFovBase = archetype === 'hunter' ? rad(260) : rad(300)
  const earFov = clamp(earFovBase * (0.85 + clamp(awarenessGene, 0, 1) * 0.35), rad(170), rad(330))
  const cosHalfEarFov = Math.cos(earFov / 2)
  const earDirs =
    earCount <= 0
      ? []
      : earAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const noseFovBase = archetype === 'hunter' ? rad(220) : rad(240)
  const noseFov = clamp(noseFovBase * (0.85 + clamp(awarenessGene, 0, 1) * 0.25), rad(140), rad(300))
  const cosHalfNoseFov = Math.cos(noseFov / 2)
  const noseDirs =
    noseCount <= 0
      ? []
      : noseAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const noseForwardBias =
    noseX.length > 0 ? clamp(noseX.reduce((sum, v) => sum + v, 0) / noseX.length, -0.65, 0.65) : 0
  const headingCos = Math.cos(heading)
  const headingSin = Math.sin(heading)

  const senseRange = Math.max(visualRange, hearingRange, smellRange, touchCount > 0 ? 26 : 0)

  return {
    visualRange,
    senseRange,
    hearingRange,
    smellRange,
    eyeDirs,
    cosHalfEyeFov,
    earDirs,
    cosHalfEarFov,
    earSideHints,
    noseDirs,
    cosHalfNoseFov,
    noseForwardBias,
    headingCos,
    headingSin,
    hasAnySense,
  }
}

function combinedDetectionChance(
  senses: SenseProfile,
  dx: number,
  dy: number,
  dist: number,
  awarenessGene: number,
  targetCamo: number,
  rng: () => number,
  occlusion?: { vision?: number; hearing?: number; smell?: number },
) {
  if (!senses.hasAnySense) return 0
  if (dist <= 12) return 1

  const inv = 1 / Math.max(dist, 0.001)
  const dirX = dx * inv
  const dirY = dy * inv

  let visual = 0
  if (senses.visualRange > 0 && dist <= senses.visualRange && senses.eyeDirs.length) {
    let best = senses.eyeDirs[0]
    let bestDot = -Infinity
    for (const eye of senses.eyeDirs) {
      const dot = dirX * eye.cos + dirY * eye.sin
      if (dot > bestDot) {
        bestDot = dot
        best = eye
      }
    }
    visual =
      detectionChance(best.cos, best.sin, dx, dy, dist, senses.visualRange, awarenessGene, targetCamo, senses.cosHalfEyeFov) *
      (occlusion?.vision ?? 1)
  }

  let hearing = 0
  if (senses.hearingRange > 0 && dist <= senses.hearingRange && senses.earDirs.length) {
    let bestDot = -Infinity
    for (const ear of senses.earDirs) {
      bestDot = Math.max(bestDot, dirX * ear.cos + dirY * ear.sin)
    }
    if (bestDot >= senses.cosHalfEarFov) {
      const side = dirX * -senses.headingSin + dirY * senses.headingCos
      const sideSign = side === 0 ? 0 : side < 0 ? -1 : 1
      const hasMatchingEar =
        sideSign === 0 ? true : senses.earSideHints.some((hint) => hint === 0 || hint === sideSign)
      const stereoBias = hasMatchingEar ? 1.12 : 0.92
      hearing = clamp(
        (1 - dist / senses.hearingRange) *
          (0.18 + clamp(awarenessGene, 0, 1) * 0.35) *
          (1 - targetCamo * 0.15) *
          stereoBias *
          (occlusion?.hearing ?? 1),
        0,
        1,
      )
    }
  }

  let smell = 0
  if (senses.smellRange > 0 && dist <= senses.smellRange && senses.noseDirs.length) {
    let bestDot = -Infinity
    for (const nose of senses.noseDirs) {
      bestDot = Math.max(bestDot, dirX * nose.cos + dirY * nose.sin)
    }
    if (bestDot >= senses.cosHalfNoseFov) {
      const forward = dirX * senses.headingCos + dirY * senses.headingSin
      const forwardBias = forward > 0 ? 1 + clamp(senses.noseForwardBias, 0, 0.65) * 0.25 : 1
      smell = clamp(
        (1 - dist / senses.smellRange) *
          (0.12 + clamp(awarenessGene, 0, 1) * 0.25) *
          forwardBias *
          (occlusion?.smell ?? 1),
        0,
        1,
      )
    }
  }

  const combined = 1 - (1 - visual) * (1 - hearing) * (1 - smell)
  // Add a tiny bit of noise so identical candidates don't lockstep forever.
  const jitter = (rng() - 0.5) * 0.03
  return clamp(combined + jitter, 0, 1)
}

function occlusionFactors(ctx: SimulationContext, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!ctx.rocks || ctx.rocks.size === 0) return { vision: 1, hearing: 1, smell: 1 }
  const ax = from.x
  const ay = from.y
  const bx = to.x
  const by = to.y
  const abx = bx - ax
  const aby = by - ay
  const abLen2 = abx * abx + aby * aby
  if (abLen2 < 1e-6) return { vision: 1, hearing: 1, smell: 1 }

  for (const rockEntity of ctx.rocks.values()) {
    const r = (Obstacle.radius[rockEntity] || 0) + 6
    if (r <= 1) continue
    const cx = Position.x[rockEntity]
    const cy = Position.y[rockEntity]
    const t = clamp(((cx - ax) * abx + (cy - ay) * aby) / abLen2, 0, 1)
    const px = ax + abx * t
    const py = ay + aby * t
    const dx = cx - px
    const dy = cy - py
    if (dx * dx + dy * dy <= r * r) {
      // Hardest on vision; partially attenuates hearing/smell.
      return { vision: 0.12, hearing: 0.7, smell: 0.55 }
    }
  }
  return { vision: 1, hearing: 1, smell: 1 }
}

function approximateBodyMass(ctx: SimulationContext, id: number, entity: number) {
  const current = Body.mass[entity]
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) return current
  const genome = ctx.genomes.get(id)
  const m = genome?.bodyMass
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m
  const fallback = (Energy.fatCapacity[entity] || 120) / 120
  return Math.max(0.3, fallback)
}

export function perceptionSystem(ctx: SimulationContext, controls: ControlState) {
  ctx.agents.forEach((entity, id) => {
    const genome = ctx.genomes.get(id)
    if (!genome) return
    if (!genome) return
    const birthTick = ctx.birthTick.get(id) ?? ctx.tick
    const yearTicks = Math.max(1, ctx.yearTicks || 2400)
    const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
    const reproductionMaturityAgeYears = clamp(
      genome?.reproductionMaturityAgeYears ?? genome?.maturityAgeYears ?? 1,
      0.1,
      6,
    )
    const isMature = ageYears >= reproductionMaturityAgeYears
    const escapeDurationMin = Math.min(genome.fleeEscapeDurationMin, genome.fleeEscapeDurationMax)
    const escapeDurationMax = Math.max(genome.fleeEscapeDurationMin, genome.fleeEscapeDurationMax)
    const escapeDuration = clamp(genome.escapeDuration, escapeDurationMin, escapeDurationMax)
    const escapeTendencyMin = Math.min(genome.fleeEscapeTendencyMin, genome.fleeEscapeTendencyMax)
    const escapeTendencyMax = Math.max(genome.fleeEscapeTendencyMin, genome.fleeEscapeTendencyMax)
    const escapeTendency = clamp(genome.escapeTendency, escapeTendencyMin, escapeTendencyMax)
    const lingerRate = clamp(genome?.lingerRate ?? 0.5, 0, 1)
    const attentionSpan = clamp(genome?.attentionSpan ?? 0.5, 0.1, 2)

    const stress = Mood.stress[entity]
    const focus = Mood.focus[entity]
    const hungerThreshold = clampGeneValue(
      'hungerThreshold',
      genome.hungerThreshold ?? DNA.hungerThreshold[entity] ?? 0,
    )
    const hungerLine = hungerThreshold + Energy.sleepDebt[entity]
    const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 1)
    const eatingGreed = clamp(genome.eatingGreed, 0, 1)
    const greedHungerOffset = clamp(genome.greedHungerOffset, 0, 1)
    const plantHungerBoostThreshold = clamp(genome.plantHungerBoostThreshold, 0, 1)
    const plantHungerBoost = clamp(genome.plantHungerBoost, 1, 2)
    const grazeTargetMinBiomass = clamp(genome.grazeTargetMinBiomass, 0, 1)
    const grazeHungerRatioThreshold = clamp(genome.grazeHungerRatioThreshold, 0, 2)
    const grazeHungerRatioNoPreyThreshold = clamp(genome.grazeHungerRatioNoPreyThreshold, 0, 2)
    const grazeTargetWeightBase = clamp(genome.grazeTargetWeightBase, 0, 4)
    const grazeTargetFatCapacityWeight = clamp(genome.grazeTargetFatCapacityWeight, 0, 1)
    const grazeTargetHungerBoostBase = clamp(genome.grazeTargetHungerBoostBase, 0, 2)
    const grazeDistanceFloor = clamp(genome.grazeDistanceFloor, 0.1, 12)
    const huntPreyHungerRatioThreshold = clamp(genome.huntPreyHungerRatioThreshold, 0, 2)
    const huntTargetDistanceFloor = clamp(genome.huntTargetDistanceFloor, 0.1, 12)
    const huntTargetFocusBase = clamp(genome.huntTargetFocusBase, 0, 2)
    const huntTargetFocusScale = clamp(genome.huntTargetFocusScale, 0, 2)
    const huntTargetAggressionBase = clamp(genome.huntTargetAggressionBase, 0, 2)
    const huntTargetAggressionScale = clamp(genome.huntTargetAggressionScale, 0, 2)
    const huntTargetAwarenessBase = clamp(genome.huntTargetAwarenessBase, 0, 2)
    const huntTargetAwarenessScale = clamp(genome.huntTargetAwarenessScale, 0, 2)
    const huntPreySizeBandScale = clamp(genome.huntPreySizeBandScale, 0, 2)
    const huntPreySizeBandOffset = clamp(genome.huntPreySizeBandOffset, 0, 1)
    const huntPreySizeBandMin = clamp(genome.huntPreySizeBandMin, 0.05, 2)
    const huntPreySizeBandMax = clamp(genome.huntPreySizeBandMax, 0.1, 3)
    const huntPreySizeBiasBase = clamp(genome.huntPreySizeBiasBase, 0, 2)
    const huntPreySizeBiasMin = clamp(genome.huntPreySizeBiasMin, 0, 1)
    const huntPreySizeBiasMax = clamp(genome.huntPreySizeBiasMax, 0.2, 2)
    const huntPreySizeOverageBase = clamp(genome.huntPreySizeOverageBase, 0, 2)
    const huntPreySizeOverageThreshold = clamp(genome.huntPreySizeOverageThreshold, 0.4, 2)
    const huntPreySizeOverageMin = clamp(genome.huntPreySizeOverageMin, 0, 1)
    const huntPreySizeOverageMax = clamp(genome.huntPreySizeOverageMax, 0.2, 2)
    const huntStickinessLingerBase = clamp(genome.huntStickinessLingerBase, 0, 2)
    const huntStickinessLingerScale = clamp(genome.huntStickinessLingerScale, 0, 2)
    const huntStickinessAttentionBase = clamp(genome.huntStickinessAttentionBase, 0, 2)
    const huntStickinessAttentionScale = clamp(genome.huntStickinessAttentionScale, 0, 2)
    const huntCarrionHungerRatioThreshold = clamp(genome.huntCarrionHungerRatioThreshold, 0, 2)
    const huntCarrionNutrientsMin = clamp(genome.huntCarrionNutrientsMin, 0, 2)
    const huntCarrionDistanceFloor = clamp(genome.huntCarrionDistanceFloor, 0.1, 12)
    const huntCarrionFocusBase = clamp(genome.huntCarrionFocusBase, 0, 2)
    const huntCarrionFocusScale = clamp(genome.huntCarrionFocusScale, 0, 2)
    const huntCarrionHungerBase = clamp(genome.huntCarrionHungerBase, 0, 2)
    const huntCarrionHungerScale = clamp(genome.huntCarrionHungerScale, 0, 3)
    const huntCarrionAffinityBase = clamp(genome.huntCarrionAffinityBase, 0, 2)
    const huntCarrionAffinityScale = clamp(genome.huntCarrionAffinityScale, 0, 2)
    const huntCarrionNutrientBase = clamp(genome.huntCarrionNutrientBase, 0, 2)
    const huntCarrionNutrientScale = clamp(genome.huntCarrionNutrientScale, 0, 2)
    const huntCarrionNutrientNorm = clamp(genome.huntCarrionNutrientNorm, 1, 2000)
    const huntCarrionNutrientClampMax = clamp(genome.huntCarrionNutrientClampMax, 0.1, 4)
    const huntCarrionPreferWeight = clamp(genome.huntCarrionPreferWeight, 0, 2)
    const fleeSizeRatioOffset = clamp(genome.fleeSizeRatioOffset, 0.1, 2)
    const fleeSizeDeltaMin = clamp(genome.fleeSizeDeltaMin, -2, 0)
    const fleeSizeDeltaMax = clamp(genome.fleeSizeDeltaMax, 0.2, 6)
    const fleeSizeMultiplierBase = clamp(genome.fleeSizeMultiplierBase, 0.4, 2.4)
    const fleeSizeMultiplierMin = clamp(genome.fleeSizeMultiplierMin, 0.01, 1)
    const fleeSizeMultiplierMax = clamp(genome.fleeSizeMultiplierMax, 0.5, 6)
    const fleePredatorScaleOffset = clamp(genome.fleePredatorScaleOffset, 0.1, 2)
    const fleePredatorScaleRange = clamp(genome.fleePredatorScaleRange, 0.1, 2)
    const fleeThreatProximityBase = clamp(genome.fleeThreatProximityBase, 0, 2)
    const fleeThreatDistanceFloor = clamp(genome.fleeThreatDistanceFloor, 0.1, 8)
    const fleeThreatProximityWeight = clamp(genome.fleeThreatProximityWeight, 0, 3)
    const fleeThreatAwarenessWeight = clamp(genome.fleeThreatAwarenessWeight, 0, 3)
    const fleeThreatCowardiceWeight = clamp(genome.fleeThreatCowardiceWeight, 0, 3)
    const fleeThreatScoreMax = clamp(genome.fleeThreatScoreMax, 0.5, 10)
    const fleeCowardiceClampMax = clamp(genome.fleeCowardiceClampMax, 0.2, 4)
    const fleeSpeedFloor = clamp(genome.fleeSpeedFloor, 0.1, 12)
    const fleeTriggerAwarenessWeight = clamp(genome.fleeTriggerAwarenessWeight, 0, 3)
    const fleeTriggerFearWeight = clamp(genome.fleeTriggerFearWeight, 0, 3)
    const fleeTriggerCourageWeight = clamp(genome.fleeTriggerCourageWeight, 0, 3)
    const fleeTriggerNormalization = clamp(genome.fleeTriggerNormalization, 0.5, 6)
    const fleeTriggerClampMin = clamp(genome.fleeTriggerClampMin, 0, 1)
    const fleeTriggerClampMax = clamp(genome.fleeTriggerClampMax, 0.5, 4)
    const fleeDangerTimerMin = clamp(genome.fleeDangerTimerMin, 0, 6)
    const fleeDangerHoldIntensityOffset = clamp(genome.fleeDangerHoldIntensityOffset, 0, 2)
    const fleeDangerHoldIntensityMin = clamp(genome.fleeDangerHoldIntensityMin, 0, 2)
    const fleeDangerHoldIntensityMax = clamp(genome.fleeDangerHoldIntensityMax, 0.5, 5)
    const fleeDangerIntensityBase = clamp(genome.fleeDangerIntensityBase, 0, 2)
    const fleeDangerDecayStep = clamp(genome.fleeDangerDecayStep, 0.001, 0.5)
    const fatigue = clamp(Mood.fatigue[entity], 0, 1)
    const sleepDebtMax = Math.max(clampGeneValue('sleepDebtMax', genome.sleepDebtMax ?? 0), 0.1)
    const sleepPressure = clamp(Energy.sleepDebt[entity] / sleepDebtMax, 0, 1)
    const inReproCooldown = ModeState.sexCooldown[entity] > 0 || ctx.pregnancies.has(id)
    const libidoThreshold = clampGeneValue('libidoThreshold', genome.libidoThreshold)
    const libidoPressureBase = clampGeneValue('libidoPressureBase', genome.libidoPressureBase)
    const libidoPressureStabilityWeight = clampGeneValue(
      'libidoPressureStabilityWeight',
      genome.libidoPressureStabilityWeight,
    )
    const curiosityDriveBase = genome.curiosityDriveBase ?? 0.7
    const curiosityDriveStabilityWeight = genome.curiosityDriveStabilityWeight ?? 0.4
    const exploreThreshold = genome.exploreThreshold ?? 0.52
    const idleDriveBase = genome.idleDriveBase ?? 0.6
    const idleDriveStabilityWeight = genome.idleDriveStabilityWeight ?? 0.6
    const idleThreshold = genome.idleThreshold ?? 0.55
    const libidoRatio = inReproCooldown ? 0 : clamp(Reproduction.libido[entity] / libidoThreshold, 0, 1)
    const libidoForMood = isMature ? libidoRatio : 0
    const aggression = clamp((DNA.aggression[entity] ?? 0.4) + (controls.aggressionBias ?? 0), 0, 1)
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
    const awareness = clamp((DNA.awareness[entity] ?? 0.5) + (controls.curiosityBias ?? 0) * 0.5, 0.05, 1)
    const archetype = decodeArchetype(AgentMeta.archetype[entity])
    const cannibalism = clamp(genome?.cannibalism ?? DNA.cannibalism[entity] ?? 0, 0, 1)
    let preferredFood =
      genome?.preferredFood && genome.preferredFood.length ? genome.preferredFood : archetypeDiet(archetype)
    if (archetype === 'hunter') {
      preferredFood = cannibalism >= 0.5 ? ['prey', 'scavenger', 'hunter'] : ['prey', 'scavenger']
    }
    const eatsPlants = preferredFood.includes('plant')
    const dietAgents = preferredFood.filter((type) => type !== 'plant')
    const speciesFear = clamp(DNA.speciesFear[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
    const conspecificFear = clamp(DNA.conspecificFear[entity] ?? 0.25, 0, 1)
    const sizeFear = clamp(DNA.sizeFear[entity] ?? 0.5, 0, 1)

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const visualGeneRange = DNA.visionRange[entity] * (1 + (awareness - 0.5) * 0.6)
    const heading = Heading.angle[entity]
    const awarenessGene = genome.awareness ?? DNA.awareness[entity] ?? 0.5
    const senses = buildSenseProfile(genome, archetype, awarenessGene, heading, visualGeneRange)
    const neighbors = ctx.agentIndex.query(mePos, senses.senseRange)

    const myBodyMass = approximateBodyMass(ctx, id, entity)
    const preySizeTargetRatio = archetype === 'hunter' ? clamp(genome.preySizeTargetRatio, 0.05, 1.5) : 1

    let threatLevel = 0
    let predatorTarget: TargetRef | null = null
    let closestPredatorDist = Infinity
    let bestPreyTarget: TargetRef | null = null
    let bestPreyWeight = -Infinity
    let bestCarrionTarget: TargetRef | null = null
    let bestCarrionWeight = -Infinity
    let allyCount = 0
    let allyProximity = 0

    const dangerRadius = genome.dangerRadius ?? senses.senseRange
    const courageGene = genome.bravery
    let forcedFlee = false
    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      const otherType = decodeArchetype(AgentMeta.archetype[otherEntity])
      const otherPos = { x: Position.x[otherEntity], y: Position.y[otherEntity] }
      const dx = otherPos.x - mePos.x
      const dy = otherPos.y - mePos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > senses.senseRange) return
      const occ = occlusionFactors(ctx, mePos, otherPos)
      const seenChance = combinedDetectionChance(
        senses,
        dx,
        dy,
        dist,
        awarenessGene,
        DNA.camo[otherEntity] ?? 0,
        ctx.rng,
        occ,
      )
      if (ctx.rng() > seenChance) return

      const sameSpecies = otherType === archetype
      const sameFamily = AgentMeta.familyColor[otherEntity] === AgentMeta.familyColor[entity]
      if (sameSpecies) {
        allyCount += 1
        allyProximity += clamp(1 - dist / Math.max(senses.senseRange, 1), 0, 1)
      }
      // Do not treat same-family conspecifics as threats; they are baseline allies.
      if (sameSpecies && sameFamily) {
        return
      }
      const otherMass = approximateBodyMass(ctx, bucket.id, otherEntity)
      const sizeRatio = otherMass / Math.max(myBodyMass, 0.001)
      // `sizeFear` is the sensitivity to size differences. Larger opponents are scarier; much smaller ones are discounted.
      const sizeDelta = clamp(sizeRatio - fleeSizeRatioOffset, fleeSizeDeltaMin, fleeSizeDeltaMax)
      const sizeMultiplier = clamp(
        fleeSizeMultiplierBase + sizeDelta * sizeFear,
        fleeSizeMultiplierMin,
        fleeSizeMultiplierMax,
      )
      const potentialFood = dietAgents.includes(otherType)

      // Treat likely prey as non-threatening (otherwise timid hunters will flee from prey).
      // Prey can still become threatening via size mismatch (sizeRatio > 1).
      if (!(potentialFood && sizeRatio <= 1)) {
        // Threat heuristics:
        // - Same family: treat as safe/ally by default (no automatic fear response).
        // - Same species but different family: mild conspecific wariness.
        // - Different species: apply species fear; prey get extra predator fear from hunters.
        let threatBase = 0
        if (!sameSpecies) {
          threatBase = speciesFear
          if (otherType === 'hunter' && archetype !== 'hunter') {
            // If the "predator" is much smaller than us, we should not overreact.
            const predatorScale = clamp((sizeRatio - fleePredatorScaleOffset) / fleePredatorScaleRange, 0, 1)
            threatBase += genome.fear * predatorScale
          }
        } else if (!sameFamily) {
          threatBase = conspecificFear
        }

        const cowardice = clamp(genome.cowardice, 0, fleeCowardiceClampMax)
        const proximity = clamp(
          fleeThreatProximityBase - dist / Math.max(senses.senseRange, fleeThreatDistanceFloor),
          0,
          1,
        )
        const threatScore = clamp(
          (threatBase + cowardice * fleeThreatCowardiceWeight) *
            (proximity * fleeThreatProximityWeight + awarenessGene * fleeThreatAwarenessWeight) *
            sizeMultiplier,
          0,
          fleeThreatScoreMax,
        )

        if (threatScore > threatLevel && dist < closestPredatorDist) {
          closestPredatorDist = dist
          threatLevel = threatScore
          predatorTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
          // Immediate reflex: if threat is pronounced, trigger flee right now
          if (threatScore > escapeTendency && dist <= dangerRadius) {
            Intent.mode[entity] = 4 // Flee
            Intent.targetType[entity] = 1
            Intent.targetId[entity] = predatorTarget.id
            ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], escapeDuration)
            ModeState.dangerTimer[entity] = Math.max(
              ModeState.dangerTimer[entity],
              dangerRadius / Math.max(DNA.baseSpeed[entity], fleeSpeedFloor),
            )
            forcedFlee = true
          }
        }
      }

      if (dietAgents.includes(otherType) && hungerRatio < huntPreyHungerRatioThreshold) {
        const baseWeight =
          (1 / Math.max(dist, huntTargetDistanceFloor)) *
          (huntTargetFocusBase + focus * huntTargetFocusScale) *
          (huntTargetAggressionBase + aggression * huntTargetAggressionScale) *
          (huntTargetAwarenessBase + awareness * huntTargetAwarenessScale)
        let sizeBias = huntPreySizeBiasBase
        if (archetype === 'hunter' && otherType === 'prey') {
          const preyMass = approximateBodyMass(ctx, bucket.id, otherEntity)
          const ratio = preyMass / Math.max(myBodyMass, 0.001)
          const band = clamp(
            preySizeTargetRatio * huntPreySizeBandScale + huntPreySizeBandOffset,
            huntPreySizeBandMin,
            huntPreySizeBandMax,
          )
          sizeBias = clamp(
            huntPreySizeBiasBase - Math.abs(ratio - preySizeTargetRatio) / band,
            huntPreySizeBiasMin,
            huntPreySizeBiasMax,
          )
          // Strongly penalize taking on prey larger than self.
          if (ratio > huntPreySizeOverageThreshold) {
            sizeBias *= clamp(
              huntPreySizeOverageBase / ratio,
              huntPreySizeOverageMin,
              huntPreySizeOverageMax,
            )
          }
        }
        const weight = baseWeight * sizeBias
        if (weight > bestPreyWeight) {
          bestPreyWeight = weight
          bestPreyTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
        }
      }
    })
    if (forcedFlee) {
      return
    }

    // Target stickiness: `lingerRate` makes agents less likely to thrash targets when weights are close.
    const stickiness =
      (huntStickinessLingerBase + lingerRate * huntStickinessLingerScale) *
      (huntStickinessAttentionBase + attentionSpan * huntStickinessAttentionScale)
    if (ModeState.targetType[entity] === 1) {
      const currentTargetId = ModeState.targetId[entity]
      const currentTargetEntity = ctx.agents.get(currentTargetId)
      if (currentTargetEntity !== undefined) {
        const currentType = decodeArchetype(AgentMeta.archetype[currentTargetEntity])
        if (dietAgents.includes(currentType)) {
          const currentPos = { x: Position.x[currentTargetEntity], y: Position.y[currentTargetEntity] }
          const dist = Math.sqrt(distanceSquared(mePos, currentPos))
          if (dist <= senses.senseRange) {
            const currentWeight =
              (1 / Math.max(dist, huntTargetDistanceFloor)) *
              (huntTargetFocusBase + focus * huntTargetFocusScale) *
              (huntTargetAggressionBase + aggression * huntTargetAggressionScale) *
              (huntTargetAwarenessBase + awareness * huntTargetAwarenessScale)
            let sizeBias = huntPreySizeBiasBase
            if (archetype === 'hunter' && currentType === 'prey') {
              const preyMass = approximateBodyMass(ctx, currentTargetId, currentTargetEntity)
              const ratio = preyMass / Math.max(myBodyMass, 0.001)
              const band = clamp(
                preySizeTargetRatio * huntPreySizeBandScale + huntPreySizeBandOffset,
                huntPreySizeBandMin,
                huntPreySizeBandMax,
              )
              sizeBias = clamp(
                huntPreySizeBiasBase - Math.abs(ratio - preySizeTargetRatio) / band,
                huntPreySizeBiasMin,
                huntPreySizeBiasMax,
              )
              if (ratio > huntPreySizeOverageThreshold) {
                sizeBias *= clamp(
                  huntPreySizeOverageBase / ratio,
                  huntPreySizeOverageMin,
                  huntPreySizeOverageMax,
                )
              }
            }
            if (currentWeight * stickiness >= bestPreyWeight) {
              bestPreyTarget = { kind: 'agent', id: currentTargetId }
              bestPreyWeight = currentWeight * sizeBias
            }
          }
        }
      }
    }

    const isScavenger = archetype === 'scavenger'
    const scavengerAffinity = clamp(isScavenger ? 1 : (genome.scavengerAffinity ?? 0), 0, 1)
    if (
      (dietAgents.length || isScavenger) &&
      (hungerRatio < huntCarrionHungerRatioThreshold || bestPreyTarget === null || archetype === 'hunter')
    ) {
      const corpseCandidates = ctx.corpseIndex.query(mePos, senses.senseRange)
      corpseCandidates.forEach((bucket) => {
        const corpseEntity = ctx.corpses.get(bucket.id)
        if (corpseEntity === undefined) return
        const nutrients = Corpse.nutrients[corpseEntity] || 0
        if (nutrients <= huntCarrionNutrientsMin) return
        const corpseArchetype = Corpse.archetype[corpseEntity]
          ? decodeArchetype(Corpse.archetype[corpseEntity])
          : undefined
        if (!corpseEdibleByStage(Corpse.stage[corpseEntity], archetype, corpseArchetype, cannibalism)) return
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > senses.senseRange) return
        const occ = occlusionFactors(ctx, mePos, corpsePos)
        const seenChance = combinedDetectionChance(senses, dx, dy, dist, awarenessGene, 0, ctx.rng, occ)
        if (ctx.rng() > seenChance) return
        const hungerNeed = clamp(1 - hungerRatio, 0, 1)
        const weight =
          (1 / Math.max(dist, huntCarrionDistanceFloor)) *
          (huntCarrionFocusBase + focus * huntCarrionFocusScale) *
          (huntCarrionHungerBase + hungerNeed * huntCarrionHungerScale) *
          (huntCarrionAffinityBase + scavengerAffinity * huntCarrionAffinityScale) *
          (huntCarrionNutrientBase +
            clamp(nutrients / huntCarrionNutrientNorm, 0, huntCarrionNutrientClampMax) *
              huntCarrionNutrientScale)
        if (weight > bestCarrionWeight) {
          bestCarrionWeight = weight
          bestCarrionTarget = { kind: 'corpse', id: bucket.id }
        }
      })
    }

    if (ModeState.targetType[entity] === 3) {
      const currentCorpseId = ModeState.targetId[entity]
      const corpseEntity = ctx.corpses.get(currentCorpseId)
      if (
        corpseEntity !== undefined &&
        (Corpse.nutrients[corpseEntity] || 0) > huntCarrionNutrientsMin &&
        corpseEdibleByStage(
          Corpse.stage[corpseEntity],
          archetype,
          Corpse.archetype[corpseEntity] ? decodeArchetype(Corpse.archetype[corpseEntity]) : undefined,
          cannibalism,
        )
      ) {
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= senses.senseRange) {
          const currentWeight =
            (1 / Math.max(dist, huntCarrionDistanceFloor)) *
            (huntCarrionFocusBase + focus * huntCarrionFocusScale) *
            (huntCarrionHungerBase + clamp(1 - hungerRatio, 0, 1) * huntCarrionHungerScale) *
            (huntCarrionAffinityBase + scavengerAffinity * huntCarrionAffinityScale)
          if (currentWeight * stickiness >= bestCarrionWeight) {
            bestCarrionTarget = { kind: 'corpse', id: currentCorpseId }
            bestCarrionWeight = currentWeight
          }
        }
      }
    }

    if (
      bestCarrionTarget &&
      (bestPreyTarget === null || bestCarrionWeight > bestPreyWeight * huntCarrionPreferWeight)
    ) {
      bestPreyTarget = bestCarrionTarget
      bestPreyWeight = Math.max(bestPreyWeight, bestCarrionWeight)
    }

    // Primitive flight reflex: override any ongoing behaviour if predator is close enough
    const fear = genome.fear
    const fleeTrigger =
      dangerRadius *
      clamp(
        (awarenessGene * fleeTriggerAwarenessWeight +
          fear * fleeTriggerFearWeight +
          courageGene * fleeTriggerCourageWeight) /
          fleeTriggerNormalization,
        fleeTriggerClampMin,
        fleeTriggerClampMax,
      )
    if (predatorTarget && closestPredatorDist <= fleeTrigger) {
      threatLevel = Math.max(threatLevel, escapeTendency)
    }

    let bestPlantTarget: TargetRef | null = null
    let bestPlantWeight = -Infinity
    const effectiveHungerRatio = clamp(hungerRatio - eatingGreed * greedHungerOffset, 0, 1)
    if (
      eatsPlants &&
      (effectiveHungerRatio < grazeHungerRatioThreshold ||
        (effectiveHungerRatio < grazeHungerRatioNoPreyThreshold && bestPreyTarget === null))
    ) {
      const plantCandidates = ctx.plantIndex.query(mePos, senses.senseRange)
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        if ((PlantStats.biomass[plantEntity] || 0) <= grazeTargetMinBiomass) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dx = plantPos.x - mePos.x
        const dy = plantPos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const occ = occlusionFactors(ctx, mePos, plantPos)
        const seenChance = combinedDetectionChance(senses, dx, dy, dist, awarenessGene, 0, ctx.rng, occ)
        if (ctx.rng() > seenChance) return
        const hungerBoost =
          hungerRatio < plantHungerBoostThreshold ? plantHungerBoost : grazeTargetHungerBoostBase
        const weight =
          (Energy.fatCapacity[entity] * grazeTargetFatCapacityWeight + grazeTargetWeightBase) *
          (1 / Math.max(dist, grazeDistanceFloor)) *
          hungerBoost
        if (weight > bestPlantWeight) {
          bestPlantWeight = weight
          bestPlantTarget = { kind: 'plant', id: bucket.id }
        }
      })
    }

    if (ModeState.targetType[entity] === 2) {
      const currentPlantId = ModeState.targetId[entity]
      const currentPlantEntity = ctx.plants.get(currentPlantId)
      if (currentPlantEntity !== undefined) {
        const dist = Math.sqrt(
          distanceSquared(mePos, { x: Position.x[currentPlantEntity], y: Position.y[currentPlantEntity] }),
        )
        if (dist <= senses.senseRange) {
          const hungerBoost =
            hungerRatio < plantHungerBoostThreshold ? plantHungerBoost : grazeTargetHungerBoostBase
          const currentWeight =
            (Energy.fatCapacity[entity] * grazeTargetFatCapacityWeight + grazeTargetWeightBase) *
            (1 / Math.max(dist, grazeDistanceFloor)) *
            hungerBoost
          if (currentWeight * stickiness >= bestPlantWeight) {
            bestPlantTarget = { kind: 'plant', id: currentPlantId }
            bestPlantWeight = currentWeight
          }
        }
      }
    }

    const socialCohesion = allyCount === 0 ? 0 : clamp(allyProximity / allyCount, 0, 1)
    const digestionBaseline = 120 + myBodyMass * 90
    const metabolismGene = clamp(DNA.metabolism[entity] ?? 8, 2, 16)
    const metabolismFactor = clamp(1.2 - (metabolismGene - 8) * 0.05, 0.6, 1.4)
    const digestionPressure = clamp(
      ((Digestion.recentIntake[entity] ?? 0) / Math.max(digestionBaseline, 1)) *
        (0.7 + eatingGreed * 0.6) *
        metabolismFactor,
      0,
      1,
    )
    const staminaGene = clampGeneValue('stamina', DNA.stamina[entity] ?? 0)
    const sleepStaminaFactorBase = clampGeneValue('sleepStaminaFactorBase', genome.sleepStaminaFactorBase ?? 0)
    const sleepStaminaFactorOffset = clampGeneValue('sleepStaminaFactorOffset', genome.sleepStaminaFactorOffset ?? 0)
    const sleepStaminaFactorScale = clampGeneValue('sleepStaminaFactorScale', genome.sleepStaminaFactorScale ?? 0)
    const sleepStaminaFactorMin = clampGeneValue('sleepStaminaFactorMin', genome.sleepStaminaFactorMin ?? 0)
    const sleepStaminaFactorMax = clampGeneValue('sleepStaminaFactorMax', genome.sleepStaminaFactorMax ?? 0)
    const staminaFactor = clamp(
      sleepStaminaFactorBase - (staminaGene - sleepStaminaFactorOffset) * sleepStaminaFactorScale,
      sleepStaminaFactorMin,
      sleepStaminaFactorMax,
    )
    const sleepEfficiency = clampGeneValue('sleepEfficiency', genome.sleepEfficiency ?? 0)
    const sleepEfficiencyBaseline = clampGeneValue('sleepEfficiencyBaseline', genome.sleepEfficiencyBaseline ?? 0)
    const sleepEfficiencyFactorBase = clampGeneValue('sleepEfficiencyFactorBase', genome.sleepEfficiencyFactorBase ?? 0)
    const sleepEfficiencyEffectScale = clampGeneValue(
      'sleepEfficiencyEffectScale',
      genome.sleepEfficiencyEffectScale ?? 0,
    )
    const sleepEfficiencyFactorMin = clampGeneValue('sleepEfficiencyFactorMin', genome.sleepEfficiencyFactorMin ?? 0)
    const sleepEfficiencyFactorMax = clampGeneValue('sleepEfficiencyFactorMax', genome.sleepEfficiencyFactorMax ?? 0)
    const efficiencyFactor = clamp(
      sleepEfficiencyFactorBase - (sleepEfficiency - sleepEfficiencyBaseline) * sleepEfficiencyEffectScale,
      sleepEfficiencyFactorMin,
      sleepEfficiencyFactorMax,
    )
    const sleepPressureRecoveryWeight = clampGeneValue(
      'sleepPressureRecoveryWeight',
      genome.sleepPressureRecoveryWeight ?? 0,
    )
    const recoveryPressure = clamp(
      fatigue * staminaFactor + sleepPressure * sleepPressureRecoveryWeight * efficiencyFactor,
      0,
      1,
    )
    const foragePressureBase = clampGeneValue('foragePressureBase', genome.foragePressureBase ?? 0)
    const foragePressureVolatility = clampGeneValue('foragePressureVolatility', genome.foragePressureVolatility ?? 0)
    const greedForageThreshold = clampGeneValue('greedForageThreshold', genome.greedForageThreshold ?? 0)
    const greedForageWeight = clampGeneValue('greedForageWeight', genome.greedForageWeight ?? 0)
    const greedForagePressureThreshold = clampGeneValue(
      'greedForagePressureThreshold',
      genome.greedForagePressureThreshold,
    )
    const foragePressureSoftGate = clampGeneValue('foragePressureSoftGate', genome.foragePressureSoftGate ?? 0)
    const foragePressureExhaustionBuffer = clampGeneValue(
      'foragePressureExhaustionBuffer',
      genome.foragePressureExhaustionBuffer,
    )
    const sleepPressureWeight = clampGeneValue('sleepPressureWeight', genome.sleepPressureWeight ?? 0)
    const exhaustionPressureBase = clampGeneValue('exhaustionPressureBase', genome.exhaustionPressureBase ?? 0)
    const exhaustionPressureStability = clampGeneValue(
      'exhaustionPressureStability',
      genome.exhaustionPressureStability,
    )
    const forageIntensityThreshold = clampGeneValue('forageIntensityThreshold', genome.forageIntensityThreshold ?? 0)
    const sleepThresholdBase = clampGeneValue('sleepThresholdBase', genome.sleepThresholdBase ?? 0)
    const sleepThresholdStability = clampGeneValue('sleepThresholdStability', genome.sleepThresholdStability ?? 0)
    const digestionThresholdBase = clampGeneValue('digestionThresholdBase', genome.digestionThresholdBase ?? 0)
    const digestionThresholdStability = clampGeneValue(
      'digestionThresholdStability',
      genome.digestionThresholdStability,
    )
    const recoveryThresholdBase = clampGeneValue('recoveryThresholdBase', genome.recoveryThresholdBase ?? 0)
    const recoveryThresholdStability = clampGeneValue(
      'recoveryThresholdStability',
      genome.recoveryThresholdStability,
    )
    const moodInput: MoodMachineInput = {
      hungerRatio,
      forageStartRatio: clamp(genome.forageStartRatio, 0.25, 0.95),
      fatigue,
      sleepPressure,
      digestionPressure,
      recoveryPressure,
      libido: libidoForMood,
      libidoThreshold,
      libidoPressureBase,
      libidoPressureStabilityWeight,
      patrolHerdCohesionWeight: clampGeneValue('patrolHerdCohesionWeight', genome.patrolHerdCohesionWeight),
      patrolHerdDependencyWeight: clampGeneValue('patrolHerdDependencyWeight', genome.patrolHerdDependencyWeight),
      patrolSocialPressureBase: clampGeneValue('patrolSocialPressureBase', genome.patrolSocialPressureBase),
      patrolSocialPressureStabilityWeight: clampGeneValue(
        'patrolSocialPressureStabilityWeight',
        genome.patrolSocialPressureStabilityWeight,
      ),
      patrolSocialThresholdBase: clampGeneValue('patrolSocialThresholdBase', genome.patrolSocialThresholdBase),
      patrolSocialThresholdStabilityWeight: clampGeneValue(
        'patrolSocialThresholdStabilityWeight',
        genome.patrolSocialThresholdStabilityWeight,
      ),
      curiosityDriveBase,
      curiosityDriveStabilityWeight,
      exploreThreshold,
      idleDriveBase,
      idleDriveStabilityWeight,
      idleThreshold,
      greed: eatingGreed,
      foragePressureBase,
      foragePressureVolatility,
      greedForageThreshold,
      greedForageWeight,
      greedForagePressureThreshold,
      foragePressureSoftGate,
      foragePressureExhaustionBuffer,
      sleepPressureWeight,
      exhaustionPressureBase,
      exhaustionPressureStability,
      forageIntensityThreshold,
      sleepThresholdBase,
      sleepThresholdStability,
      digestionThresholdBase,
      digestionThresholdStability,
      recoveryThresholdBase,
      recoveryThresholdStability,
      threatLevel: clamp(threatLevel, 0, 1),
      socialCohesion,
      curiosity,
      aggression,
      fightPersistence: clamp(genome.fightPersistence, 0, 1),
      fear: genome.fear,
      cowardice: genome.cowardice,
      fleeFearBiasFearWeight: clamp(genome.fleeFearBiasFearWeight, 0, 1.5),
      fleeFearBiasCowardiceWeight: clamp(genome.fleeFearBiasCowardiceWeight, 0, 1.5),
      fleeSurvivalThreatBase: clamp(genome.fleeSurvivalThreatBase, 0, 2),
      fleeSurvivalThreatFearScale: clamp(genome.fleeSurvivalThreatFearScale, 0, 2),
      fleeSurvivalStabilityBase: clamp(genome.fleeSurvivalStabilityBase, 0, 2),
      fleeSurvivalStabilityScale: clamp(genome.fleeSurvivalStabilityScale, 0, 2),
      fleeSurvivalStressWeight: clamp(genome.fleeSurvivalStressWeight, 0, 1),
      fleeSurvivalThresholdBase: clamp(genome.fleeSurvivalThresholdBase, 0, 1),
      fleeSurvivalThresholdStabilityScale: clamp(genome.fleeSurvivalThresholdStabilityScale, 0, 1),
      fleeFightDriveAggressionWeight: clamp(genome.fleeFightDriveAggressionWeight, 0, 2),
      fleeFightDrivePersistenceWeight: clamp(genome.fleeFightDrivePersistenceWeight, 0, 2),
      fleeBraveFearOffset: clamp(genome.fleeBraveFearOffset, 0, 1),
      fleeBraveThreatThreshold: clamp(genome.fleeBraveThreatThreshold, 0, 1),
      cohesion: clampGeneValue('cohesion', genome.cohesion),
      dependency: clampGeneValue('dependency', genome.dependency),
      moodStability: DNA.moodStability[entity] ?? 0.5,
      stress,
      currentMood: decodeMoodKind(Mood.state[entity]),
      predatorTarget,
      preyTarget: bestPreyTarget,
      plantTarget: bestPlantTarget,
    }

    const decision = resolveMood(moodInput)

    if (predatorTarget && closestPredatorDist <= fleeTrigger) {
      decision.behaviour.mode = 'flee'
      decision.behaviour.target = predatorTarget
      ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], Math.max(fleeDangerTimerMin, escapeDuration))
    }

    // Scavengers only eat dead bodies: never graze plants or hunt live animals.
    if (archetype === 'scavenger') {
      const forageStartRatio = clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95)
      if (bestCarrionTarget && hungerRatio < forageStartRatio) {
        decision.behaviour.mode = 'hunt'
        decision.behaviour.target = bestCarrionTarget
      } else if (decision.behaviour.mode === 'hunt' || decision.behaviour.mode === 'graze') {
        decision.behaviour.mode = 'patrol'
        decision.behaviour.target = null
      }
    }

    // Align behaviour with explicit search targets by mood
    if (decision.behaviour.mode === 'hunt' && bestPreyTarget) {
      decision.behaviour.target = bestPreyTarget
    } else if (decision.behaviour.mode === 'graze' && bestPlantTarget) {
      decision.behaviour.target = bestPlantTarget
    } else if (decision.behaviour.mode === 'mate') {
      decision.behaviour.target = findMateTarget(ctx, entity, id)
    } else if (decision.behaviour.mode === 'patrol') {
      decision.behaviour.target = preferForageTarget(bestPreyTarget, bestPlantTarget)
    } else if (decision.behaviour.mode === 'fight') {
      decision.behaviour.target = predatorTarget ?? decision.behaviour.target ?? bestPreyTarget
    }

    applyBehaviourIntent(entity, decision.behaviour)

    if (decision.tier === 'survival') {
      const survivalHold = escapeDuration * clamp(
        fleeDangerHoldIntensityOffset + decision.intensity,
        fleeDangerHoldIntensityMin,
        fleeDangerHoldIntensityMax,
      )
      ModeState.dangerTimer[entity] = Math.max(
        ModeState.dangerTimer[entity],
        Math.max(decision.intensity + fleeDangerIntensityBase, survivalHold),
      )
    } else if (ModeState.dangerTimer[entity] > 0) {
      ModeState.dangerTimer[entity] = Math.max(0, ModeState.dangerTimer[entity] - fleeDangerDecayStep)
    }

    Mood.state[entity] = encodeMoodKind(decision.mood)
    Mood.tier[entity] = encodeMoodTier(decision.tier)
    Mood.intensity[entity] = decision.intensity
    if (decision.tier === 'survival') {
      Mood.stress[entity] = clamp(Mood.stress[entity] + decision.intensity * 0.35, 0, 1)
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.15, 0, 1)
    } else {
      Mood.stress[entity] = clamp(Mood.stress[entity] * 0.97, 0, 1)
    }
    if (decision.behaviour.mode === 'hunt' || decision.behaviour.mode === 'graze') {
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.1, 0, 1)
    } else if (decision.behaviour.mode === 'sleep') {
      Mood.focus[entity] = clamp(Mood.focus[entity] * 0.92, 0, 1)
    }
    Mood.social[entity] = clamp(
      Mood.social[entity] + (decision.mood === 'bonding' ? 0.08 : (ctx.rng() - 0.5) * 0.015),
      0,
      1,
    )
  })
}

function findMateTarget(ctx: SimulationContext, entity: number, entityId: number): TargetRef | null {
  const selfGenome = ctx.genomes.get(entityId)
  const birthTick = ctx.birthTick.get(entityId) ?? ctx.tick
  const yearTicks = Math.max(1, ctx.yearTicks || 2400)
  const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
  const reproductionMaturityAgeYears = clampGeneValue(
    'reproductionMaturityAgeYears',
    selfGenome?.reproductionMaturityAgeYears ?? selfGenome?.maturityAgeYears ?? 0,
  )
  if (ageYears < reproductionMaturityAgeYears) return null

  const libido = Reproduction.libido[entity]
  const libidoThreshold = Reproduction.libidoThreshold[entity]
  if (!Number.isFinite(libidoThreshold) || libido < libidoThreshold) return null
  const selfBiome = selfGenome?.biome ?? 'land'
  const mateRangeValue = selfGenome?.mateRange ?? DNA.mateRange[entity]
  if (!Number.isFinite(mateRangeValue)) return null
  const mateRange = clampGeneValue('mateRange', mateRangeValue)
  const mateSenseRange = mateRange
  let bestId: number | null = null
  let bestDist = Infinity
  const mePos = { x: Position.x[entity], y: Position.y[entity] }
  const neighbors = ctx.agentIndex.query(mePos, mateSenseRange)
  neighbors.forEach((bucket) => {
    if (bucket.id === entityId) return
    const mateEntity = ctx.agents.get(bucket.id)
    if (mateEntity === undefined) return
    const mateGenome = ctx.genomes.get(bucket.id)
    const mateBirthTick = ctx.birthTick.get(bucket.id) ?? ctx.tick
    const mateAgeYears = Math.max(0, ctx.tick - mateBirthTick) / yearTicks
    const mateReproductionMaturityAge = clampGeneValue(
      'reproductionMaturityAgeYears',
      mateGenome?.reproductionMaturityAgeYears ?? mateGenome?.maturityAgeYears ?? 0,
    )
    if (mateAgeYears < mateReproductionMaturityAge) return
    if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) return
    const mateBiome = mateGenome?.biome ?? 'land'
    if (mateBiome !== selfBiome) return
    if (ctx.pregnancies.has(bucket.id)) return
    const dx = Position.x[mateEntity] - Position.x[entity]
    const dy = Position.y[mateEntity] - Position.y[entity]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > mateSenseRange) return
    if (dist < bestDist) {
      bestDist = dist
      bestId = bucket.id
    }
  })
  return bestId === null ? null : { kind: 'agent', id: bestId }
}

function preferForageTarget(prey: TargetRef | null | undefined, plant: TargetRef | null | undefined) {
  if (plant && !prey) return plant
  if (prey && !plant) return prey
  return plant ?? prey ?? null
}

function decodeArchetype(code: number): 'hunter' | 'prey' | 'scavenger' {
  switch (code) {
    case ArchetypeCode.Hunter:
      return 'hunter'
    case ArchetypeCode.Scavenger:
      return 'scavenger'
    default:
      return 'prey'
  }
}

function archetypeDiet(archetype: string) {
  if (archetype === 'hunter') return ['prey', 'scavenger']
  if (archetype === 'scavenger') return []
  return ['plant']
}

export const __test__ = {
  buildSenseProfile,
  combinedDetectionChance,
}
