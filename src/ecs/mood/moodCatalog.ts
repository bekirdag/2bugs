import type { MoodKind, MoodTier } from '@/types/sim'

const MOOD_CODE: Record<MoodKind, number> = {
  panic: 1,
  starving: 2,
  foraging: 3,
  exhausted: 4,
  'seeking-mate': 5,
  bonding: 6,
  exploring: 7,
  idle: 8,
}

const TIER_CODE: Record<MoodTier, number> = {
  survival: 1,
  physiological: 2,
  reproductive: 3,
  social: 4,
  growth: 5,
}

export function encodeMoodKind(kind: MoodKind | undefined): number {
  return MOOD_CODE[kind ?? 'idle'] ?? MOOD_CODE.idle
}

export function decodeMoodKind(code: number): MoodKind {
  const match = Object.entries(MOOD_CODE).find(([, value]) => value === code)
  return (match?.[0] as MoodKind) ?? 'idle'
}

export function encodeMoodTier(tier: MoodTier | undefined): number {
  return TIER_CODE[tier ?? 'growth'] ?? TIER_CODE.growth
}

export function decodeMoodTier(code: number): MoodTier {
  const match = Object.entries(TIER_CODE).find(([, value]) => value === code)
  return (match?.[0] as MoodTier) ?? 'growth'
}
