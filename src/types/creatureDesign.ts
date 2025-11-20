export type CreaturePatternStyle = 'stripes' | 'dapples' | 'spines'

export type CreatureDesignConfig = {
  silhouetteStretch: number // 0..1
  torsoDepth: number // 0..1
  headCrest: number // 0..1
  platingStrength: number // 0..1
  tailLength: number // 0..1
  patternStyle: CreaturePatternStyle
  coreColor: string
  accentColor: string
  glowColor: string
  lumens: number // 0..1, used for emissive areas
}
