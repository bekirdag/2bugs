import type { CorpseStage } from '@/types/sim'

export const CORPSE_STAGE = {
  Fresh: 1,
  Dead: 2,
} as const

export type CorpseStageCode = typeof CORPSE_STAGE[keyof typeof CORPSE_STAGE]

export function encodeCorpseStage(stage: CorpseStage | undefined): CorpseStageCode {
  return stage === 'dead' ? CORPSE_STAGE.Dead : CORPSE_STAGE.Fresh
}

export function decodeCorpseStage(code: number | undefined): CorpseStage {
  return code === CORPSE_STAGE.Dead ? 'dead' : 'fresh'
}

export function corpseEdibleByStage(
  stage: number | undefined,
  archetype: 'hunter' | 'prey' | 'scavenger',
  corpseArchetype?: 'hunter' | 'prey' | 'scavenger',
  cannibalism = 0,
): boolean {
  const resolved = stage === CORPSE_STAGE.Dead ? 'dead' : 'fresh'
  if (corpseArchetype && corpseArchetype === archetype && cannibalism < 0.5) return false
  if (archetype === 'scavenger') return resolved === 'dead'
  if (archetype === 'hunter') return resolved === 'fresh'
  return false
}
