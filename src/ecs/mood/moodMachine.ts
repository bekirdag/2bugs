import type { AgentMode, MoodKind, MoodTier, TargetRef } from '@/types/sim'
import { clamp } from '@/utils/math'
import { clampGeneValue } from '@/ecs/genetics'

export interface MoodMachineInput {
  hungerRatio: number
  forageStartRatio: number
  fatigue: number
  sleepPressure: number
  digestionPressure?: number
  recoveryPressure?: number
  libido: number
  libidoThreshold: number
  libidoPressureBase: number
  libidoPressureStabilityWeight: number
  patrolHerdCohesionWeight: number
  patrolHerdDependencyWeight: number
  patrolSocialPressureBase: number
  patrolSocialPressureStabilityWeight: number
  patrolSocialThresholdBase: number
  patrolSocialThresholdStabilityWeight: number
  curiosityDriveBase: number
  curiosityDriveStabilityWeight: number
  exploreThreshold: number
  idleDriveBase: number
  idleDriveStabilityWeight: number
  idleThreshold: number
  greed: number
  foragePressureBase: number
  foragePressureVolatility: number
  greedForageThreshold: number
  greedForageWeight: number
  greedForagePressureThreshold: number
  foragePressureSoftGate: number
  foragePressureExhaustionBuffer: number
  sleepThresholdBase: number
  sleepThresholdStability: number
  digestionThresholdBase: number
  digestionThresholdStability: number
  recoveryThresholdBase: number
  recoveryThresholdStability: number
  threatLevel: number
  socialCohesion: number
  curiosity: number
  aggression: number
  fightPersistence: number
  fear: number
  cowardice: number
  fleeFearBiasFearWeight: number
  fleeFearBiasCowardiceWeight: number
  fleeSurvivalThreatBase: number
  fleeSurvivalThreatFearScale: number
  fleeSurvivalStabilityBase: number
  fleeSurvivalStabilityScale: number
  fleeSurvivalStressWeight: number
  fleeSurvivalThresholdBase: number
  fleeSurvivalThresholdStabilityScale: number
  fleeFightDriveAggressionWeight: number
  fleeFightDrivePersistenceWeight: number
  fleeBraveFearOffset: number
  fleeBraveThreatThreshold: number
  cohesion: number
  dependency: number
  moodStability: number
  stress: number
  currentMood?: MoodKind
  predatorTarget?: TargetRef | null
  preyTarget?: TargetRef | null
  plantTarget?: TargetRef | null
}

export interface BehaviourIntent {
  mode: AgentMode
  target?: TargetRef | null
}

export interface MoodDecision {
  mood: MoodKind
  tier: MoodTier
  intensity: number
  behaviour: BehaviourIntent
}

function preferForageTarget(prey: TargetRef | null | undefined, plant: TargetRef | null | undefined) {
  if (plant && !prey) return plant
  if (prey && !plant) return prey
  // Plants are safer; if both exist, pick based on proximity encoded in id randomness to break ties.
  return plant ?? prey ?? null
}

export function resolveMood(input: MoodMachineInput): MoodDecision {
  const stability = clamp(input.moodStability ?? 0.5, 0.05, 1)
  const fearBias = clamp(
    input.fear * input.fleeFearBiasFearWeight + input.cowardice * input.fleeFearBiasCowardiceWeight,
    0,
    1,
  )
  const survivalPressure = clamp(
    input.threatLevel *
      (input.fleeSurvivalThreatBase + fearBias * input.fleeSurvivalThreatFearScale) *
      (input.fleeSurvivalStabilityBase - stability * input.fleeSurvivalStabilityScale) +
      input.stress * input.fleeSurvivalStressWeight,
    0,
    1,
  )
  const survivalThreshold =
    input.fleeSurvivalThresholdBase - (1 - stability) * input.fleeSurvivalThresholdStabilityScale
  if (survivalPressure > survivalThreshold) {
    const persistence = clamp(input.fightPersistence, 0, 1)
    const fightDrive = clamp(
      input.aggression * input.fleeFightDriveAggressionWeight + persistence * input.fleeFightDrivePersistenceWeight,
      0,
      1,
    )
    const braveEnough =
      fightDrive > fearBias + input.fleeBraveFearOffset &&
      input.threatLevel > input.fleeBraveThreatThreshold
    if (braveEnough && input.predatorTarget) {
      return {
        mood: 'panic',
        tier: 'survival',
        intensity: survivalPressure,
        behaviour: { mode: 'fight', target: input.predatorTarget },
      }
    }
    return {
      mood: 'panic',
      tier: 'survival',
      intensity: survivalPressure,
      behaviour: { mode: 'flee', target: input.predatorTarget ?? null },
    }
  }

  const hungerPressure = clamp(1 - input.hungerRatio, 0, 1)
  const forageStartRatio = clamp(input.forageStartRatio, 0.25, 0.95)
  const forageStartPressure = 1 - forageStartRatio
  const sleepPressureWeight = clampGeneValue('sleepPressureWeight', input.sleepPressureWeight)
  const exhaustionPressureBase = clampGeneValue('exhaustionPressureBase', input.exhaustionPressureBase)
  const exhaustionPressureStability = clampGeneValue(
    'exhaustionPressureStability',
    input.exhaustionPressureStability,
  )
  const exhaustionPressure = clamp(
    Math.max(input.fatigue, input.sleepPressure * sleepPressureWeight) *
      (exhaustionPressureBase + (1 - stability) * exhaustionPressureStability),
    0,
    1,
  )
  const digestionPressure = clamp(input.digestionPressure ?? 0, 0, 1)
  const digestionThresholdBase = clamp(input.digestionThresholdBase, 0, 1)
  const digestionThresholdStability = clamp(input.digestionThresholdStability, 0, 0.5)
  const digestThreshold = clamp(
    digestionThresholdBase - (stability - 0.5) * digestionThresholdStability,
    0,
    1,
  )
  const recoveryPressure = clamp(input.recoveryPressure ?? 0, 0, 1)
  const recoveryThresholdBase = clamp(input.recoveryThresholdBase, 0, 1)
  const recoveryThresholdStability = clamp(input.recoveryThresholdStability, 0, 0.5)
  const recoveryThreshold = clamp(
    recoveryThresholdBase - (stability - 0.5) * recoveryThresholdStability,
    0,
    1,
  )
  const sleepThresholdBase = clampGeneValue('sleepThresholdBase', input.sleepThresholdBase)
  const sleepThresholdStability = clampGeneValue('sleepThresholdStability', input.sleepThresholdStability)
  const sleepThreshold = clamp(
    sleepThresholdBase - (1 - stability) * sleepThresholdStability,
    0,
    1,
  )
  const libidoPressureBase = clampGeneValue('libidoPressureBase', input.libidoPressureBase)
  const libidoPressureStabilityWeight = clampGeneValue(
    'libidoPressureStabilityWeight',
    input.libidoPressureStabilityWeight,
  )
  const libidoPressure = clamp(
    input.libido * (libidoPressureBase + (1 - stability) * libidoPressureStabilityWeight),
    0,
    1,
  )
  const libidoThreshold = clampGeneValue('libidoThreshold', input.libidoThreshold)
  const canMate =
    libidoPressure >= libidoThreshold &&
    input.hungerRatio >= forageStartRatio &&
    exhaustionPressure <= sleepThreshold &&
    digestionPressure <= digestThreshold &&
    recoveryPressure <= recoveryThreshold
  if (canMate) {
    return {
      mood: 'seeking-mate',
      tier: 'reproductive',
      intensity: libidoPressure,
      behaviour: { mode: 'mate' },
    }
  }

  const greed = clamp(input.greed, 0, 1)
  const foragePressureBase = clamp(input.foragePressureBase, 0, 1.5)
  const foragePressureVolatility = clamp(input.foragePressureVolatility, 0, 1.2)
  const greedForageThreshold = clamp(input.greedForageThreshold, 0, 1)
  const greedForageWeight = clamp(input.greedForageWeight, 0, 1.5)
  const greedForagePressureThreshold = clamp(input.greedForagePressureThreshold, 0, 1)
  const foragePressureSoftGate = clamp(input.foragePressureSoftGate, 0, 1)
  const foragePressureExhaustionBuffer = clamp(input.foragePressureExhaustionBuffer, 0, 0.5)
  const greedPressure =
    greedForageThreshold >= 1 ? 0 : clamp((greed - greedForageThreshold) / (1 - greedForageThreshold), 0, 1)
  const foragePressure = clamp(
    hungerPressure * (foragePressureBase + (1 - stability) * foragePressureVolatility) +
      greedPressure * greedForageWeight,
    0,
    1,
  )

  const forageByRatio = input.hungerRatio < forageStartRatio
  const greedyForage = greedPressure > greedForagePressureThreshold && (input.preyTarget || input.plantTarget)
  const forageByPressure =
    foragePressure > forageStartPressure ||
    (foragePressure > forageStartPressure * foragePressureSoftGate &&
      foragePressure > exhaustionPressure + foragePressureExhaustionBuffer)
  if (forageByRatio || forageByPressure || greedyForage) {
    const target = preferForageTarget(input.preyTarget, input.plantTarget)
    const mode: AgentMode = target?.kind === 'plant' ? 'graze' : 'hunt'
    const forageIntensityThreshold = clamp(input.forageIntensityThreshold, 0, 1)
    const intense = foragePressure > forageIntensityThreshold
    return {
      mood: intense ? 'starving' : 'foraging',
      tier: 'physiological',
      intensity: foragePressure,
      behaviour: { mode, target },
    }
  }

  if (exhaustionPressure > sleepThreshold) {
    return {
      mood: 'exhausted',
      tier: 'physiological',
      intensity: exhaustionPressure,
      behaviour: { mode: 'sleep' },
    }
  }

  if (digestionPressure > digestThreshold) {
    return {
      mood: 'idle',
      tier: 'physiological',
      intensity: digestionPressure,
      behaviour: { mode: 'digest' },
    }
  }

  if (recoveryPressure > recoveryThreshold) {
    return {
      mood: 'exhausted',
      tier: 'physiological',
      intensity: recoveryPressure,
      behaviour: { mode: 'recover' },
    }
  }

  const patrolHerdCohesionWeight = clampGeneValue('patrolHerdCohesionWeight', input.patrolHerdCohesionWeight)
  const patrolHerdDependencyWeight = clampGeneValue('patrolHerdDependencyWeight', input.patrolHerdDependencyWeight)
  const patrolSocialPressureBase = clampGeneValue('patrolSocialPressureBase', input.patrolSocialPressureBase)
  const patrolSocialPressureStabilityWeight = clampGeneValue(
    'patrolSocialPressureStabilityWeight',
    input.patrolSocialPressureStabilityWeight,
  )
  const patrolSocialThresholdBase = clampGeneValue('patrolSocialThresholdBase', input.patrolSocialThresholdBase)
  const patrolSocialThresholdStabilityWeight = clampGeneValue(
    'patrolSocialThresholdStabilityWeight',
    input.patrolSocialThresholdStabilityWeight,
  )
  const herdDesire = clamp(
    input.cohesion * patrolHerdCohesionWeight + input.dependency * patrolHerdDependencyWeight,
    0,
    1,
  )
  const isolationPenalty = clamp(1 - input.socialCohesion, 0, 1)
  const socialPressure =
    isolationPenalty *
    herdDesire *
    (patrolSocialPressureBase + (1 - stability) * patrolSocialPressureStabilityWeight)
  const socialThreshold = patrolSocialThresholdBase - (1 - stability) * patrolSocialThresholdStabilityWeight
  if (socialPressure > socialThreshold) {
    return {
      mood: 'bonding',
      tier: 'social',
      intensity: socialPressure,
      behaviour: { mode: 'patrol' },
    }
  }

  const curiosityDriveBase = clamp(input.curiosityDriveBase, 0, 2)
  const curiosityDriveStabilityWeight = clamp(input.curiosityDriveStabilityWeight, 0, 2)
  const exploreThreshold = clamp(input.exploreThreshold, 0, 1)
  const idleDriveBase = clamp(input.idleDriveBase, 0, 2)
  const idleDriveStabilityWeight = clamp(input.idleDriveStabilityWeight, 0, 2)
  const idleThreshold = clamp(input.idleThreshold, 0, 1)
  const curiosityDrive = clamp(
    input.curiosity * (curiosityDriveBase + (1 - stability) * curiosityDriveStabilityWeight),
    0,
    1,
  )
  const wantsExplore = curiosityDrive > exploreThreshold || input.currentMood === 'exploring'
  const idleDrive = clamp((1 - input.curiosity) * (idleDriveBase + stability * idleDriveStabilityWeight), 0, 1)
  const wantsIdle = !wantsExplore && idleDrive > idleThreshold
  return {
    mood: wantsExplore ? 'exploring' : 'idle',
    tier: 'growth',
    intensity: wantsExplore ? curiosityDrive : idleDrive,
    behaviour: { mode: wantsIdle ? 'idle' : 'patrol' },
  }
}
