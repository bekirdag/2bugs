import type { CreatureDesignConfig } from '@/types/creatureDesign'

export type CreatureVariant = 'hunter' | 'prey' | 'juvenile'

export type VariantProfile = {
  lean: number
  massBias: number
  headBias: number
  tailBoost: number
  platingBoost: number
  elevation: number
}

export type CreatureDimensions = {
  length: number
  thickness: number
  headSize: number
  crestHeight: number
  tailLength: number
  platingSegments: number
  headAnchor: number
}

export type CreaturePalette = {
  base: number
  underbelly: number
  accent: number
  pattern: number
  glow: number
}

export const CREATURE_VARIANT_ORDER: CreatureVariant[] = ['hunter', 'prey', 'juvenile']

export const VARIANT_PROFILE: Record<CreatureVariant, VariantProfile> = {
  hunter: { lean: 0.15, massBias: -0.1, headBias: 0.1, tailBoost: 0.2, platingBoost: 0.3, elevation: 0 },
  prey: { lean: -0.05, massBias: 0.2, headBias: -0.05, tailBoost: -0.05, platingBoost: -0.1, elevation: 18 },
  juvenile: { lean: -0.15, massBias: -0.2, headBias: -0.15, tailBoost: -0.25, platingBoost: -0.2, elevation: 32 },
}

export function computeDimensions(config: CreatureDesignConfig, profile: VariantProfile): CreatureDimensions {
  const length = lerp(120, 240, clamp01(config.silhouetteStretch + profile.lean))
  const thickness = lerp(40, 110, clamp01(config.torsoDepth + profile.massBias))
  const headSize = lerp(30, 80, clamp01(config.headCrest + profile.headBias))
  const crestHeight = lerp(20, 90, clamp01(config.headCrest + profile.headBias + 0.15))
  const tailLength = lerp(60, 190, clamp01(config.tailLength + profile.tailBoost))
  const platingSegments = Math.max(3, Math.round(4 + clamp01(config.platingStrength + profile.platingBoost) * 6))
  const headAnchor = length / 2 - headSize * 0.4
  return { length, thickness, headSize, crestHeight, tailLength, platingSegments, headAnchor }
}

export function buildPalette(config: CreatureDesignConfig, variant: CreatureVariant): CreaturePalette {
  const coreShift = variant === 'hunter' ? -0.15 : variant === 'prey' ? 0.15 : 0.25
  const accentShift = variant === 'juvenile' ? 0.1 : 0
  const glowShift = variant === 'hunter' ? -0.1 : 0.05
  return {
    base: adjustColor(config.coreColor, coreShift),
    underbelly: adjustColor(config.coreColor, 0.35),
    accent: adjustColor(config.accentColor, accentShift),
    pattern: adjustColor(config.coreColor, variant === 'hunter' ? -0.35 : 0.2),
    glow: adjustColor(config.glowColor, glowShift),
  }
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function lerp(min: number, max: number, t: number) {
  return min + (max - min) * clamp01(t)
}

function adjustColor(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex)
  const adjust = (channel: number) => {
    if (amount >= 0) {
      return Math.round(channel + (255 - channel) * amount)
    }
    return Math.round(channel * (1 + amount))
  }
  return (adjust(r) << 16) + (adjust(g) << 8) + adjust(b)
}

function hexToRgb(value: string) {
  const safe = value.startsWith('#') ? value.slice(1) : value
  const int = parseInt(safe, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}
