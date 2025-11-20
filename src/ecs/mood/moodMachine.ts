import type { AgentMode, MoodKind, MoodTier, TargetRef } from '@/types/sim'
import { clamp } from '@/utils/math'

export interface MoodMachineInput {
  hungerRatio: number
  fatigue: number
  sleepPressure: number
  libido: number
  threatLevel: number
  socialCohesion: number
  curiosity: number
  aggression: number
  fear: number
  cowardice: number
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
  const fearBias = clamp((input.fear ?? 0.3) * 0.6 + (input.cowardice ?? 0.3) * 0.4, 0, 1)
  const survivalPressure = clamp(
    input.threatLevel * (0.65 + fearBias * 0.7) * (1.1 - stability * 0.2) + input.stress * 0.15,
    0,
    1,
  )
  const survivalThreshold = 0.45 - (1 - stability) * 0.12
  if (survivalPressure > survivalThreshold) {
    const braveEnough = (input.aggression ?? 0.3) > (fearBias + 0.15) && (input.threatLevel ?? 0) > 0.45
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
  const exhaustionPressure = clamp(
    Math.max(input.fatigue, input.sleepPressure * 0.8) * (1.05 + (1 - stability) * 0.05),
    0,
    1,
  )
  const foragePressure = hungerPressure * (0.8 + (1 - stability) * 0.4)

  if (foragePressure > 0.6 || (foragePressure > 0.35 && foragePressure > exhaustionPressure + 0.1)) {
    const target = preferForageTarget(input.preyTarget, input.plantTarget)
    const mode: AgentMode = target?.kind === 'plant' ? 'graze' : 'hunt'
    const intense = foragePressure > 0.8
    return {
      mood: intense ? 'starving' : 'foraging',
      tier: 'physiological',
      intensity: foragePressure,
      behaviour: { mode, target },
    }
  }

  const sleepThreshold = 0.55 - (1 - stability) * 0.1
  if (exhaustionPressure > sleepThreshold) {
    return {
      mood: 'exhausted',
      tier: 'physiological',
      intensity: exhaustionPressure,
      behaviour: { mode: 'sleep' },
    }
  }

  const libidoPressure = clamp(input.libido * (0.8 + (1 - stability) * 0.25), 0, 1)
  const libidoThreshold = 0.62 - (1 - stability) * 0.12
  if (libidoPressure > libidoThreshold) {
    return {
      mood: 'seeking-mate',
      tier: 'reproductive',
      intensity: libidoPressure,
      behaviour: { mode: 'mate' },
    }
  }

  const herdDesire = clamp((input.cohesion ?? 0.2) * 0.6 + (input.dependency ?? 0.2) * 0.4, 0, 1)
  const isolationPenalty = clamp(1 - input.socialCohesion, 0, 1)
  const socialPressure = isolationPenalty * herdDesire * (1.05 + (1 - stability) * 0.1)
  const socialThreshold = 0.52 - (1 - stability) * 0.08
  if (socialPressure > socialThreshold) {
    return {
      mood: 'bonding',
      tier: 'social',
      intensity: socialPressure,
      behaviour: { mode: 'patrol' },
    }
  }

  const curiosityDrive = clamp(input.curiosity * (0.7 + (1 - stability) * 0.4), 0, 1)
  const wantsExplore = curiosityDrive > 0.52 || input.currentMood === 'exploring'
  return {
    mood: wantsExplore ? 'exploring' : 'idle',
    tier: 'growth',
    intensity: curiosityDrive,
    behaviour: { mode: 'patrol' },
  }
}
