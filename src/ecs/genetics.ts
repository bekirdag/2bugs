import type { DNA } from '@/types/sim'
import { clamp } from '@/utils/math'

export const GENE_KEYS = [
  'baseSpeed',
  'visionRange',
  'hungerThreshold',
  'fatCapacity',
  'fatBurnThreshold',
  'patrolThreshold',
  'aggression',
  'bravery',
  'power',
  'defence',
  'fightPersistence',
  'escapeTendency',
  'escapeDuration',
  'lingerRate',
  'dangerRadius',
  'attentionSpan',
  'libidoThreshold',
  'libidoGainRate',
  'mutationRate',
  'bodyMass',
  'metabolism',
  'turnRate',
  'curiosity',
  'cohesion',
  'fear',
  'cowardice',
  'speciesFear',
  'conspecificFear',
  'sizeFear',
  'dependency',
  'independenceAge',
  'camo',
  'awareness',
  'fertility',
  'gestationCost',
  'moodStability',
  'stamina',
  'circadianBias',
  'sleepEfficiency',
  'scavengerAffinity',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'preySizeTargetRatio',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'forageStartRatio',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'eatingGreed',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'maturityAgeYears',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'cannibalism',
] as const

export type GeneKey = typeof GENE_KEYS[number]

export const GENE_INDEX: Record<GeneKey, number> = GENE_KEYS.reduce(
  (acc, key, index) => {
    acc[key] = index
    return acc
  },
  {} as Record<GeneKey, number>,
)

export function markGeneMutation(mask: number, gene: GeneKey): number {
  return mask | (1 << GENE_INDEX[gene])
}

export function hasGeneMutation(mask: number, gene: GeneKey): boolean {
  return (mask & (1 << GENE_INDEX[gene])) !== 0
}

export function genesFromMask(mask: number): GeneKey[] {
  return GENE_KEYS.filter((gene) => hasGeneMutation(mask, gene))
}

export type GeneDominance = Record<GeneKey, number>

export const DEFAULT_DOMINANCE: GeneDominance = Object.fromEntries(
  GENE_KEYS.map((key) => [key, key === 'mutationRate' ? 0.2 : 0.5]),
) as GeneDominance

export const GENE_RANGES: Record<GeneKey, { min: number; max: number }> = {
  baseSpeed: { min: 120, max: 520 },
  visionRange: { min: 140, max: 420 },
  hungerThreshold: { min: 20, max: 140 },
  fatCapacity: { min: 40, max: 20000 },
  fatBurnThreshold: { min: 0, max: 20000 },
  patrolThreshold: { min: 0, max: 200 },
  aggression: { min: 0, max: 1 },
  bravery: { min: 0, max: 1 },
  power: { min: 20, max: 200 },
  defence: { min: 20, max: 200 },
  fightPersistence: { min: 0, max: 1 },
  escapeTendency: { min: 0, max: 1 },
  escapeDuration: { min: 0.5, max: 8 },
  lingerRate: { min: 0, max: 1 },
  dangerRadius: { min: 80, max: 320 },
  attentionSpan: { min: 0.2, max: 1.5 },
  libidoThreshold: { min: 0.1, max: 1 },
  libidoGainRate: { min: 0.01, max: 0.2 },
  mutationRate: { min: 0.0001, max: 0.2 },
  bodyMass: { min: 0.2, max: 80 },
  metabolism: { min: 2, max: 16 },
  turnRate: { min: 0.5, max: 4 },
  curiosity: { min: 0, max: 1 },
  cohesion: { min: 0, max: 1 },
  fear: { min: 0, max: 1 },
  cowardice: { min: 0, max: 1 },
  speciesFear: { min: 0.1, max: 1 },
  conspecificFear: { min: 0.05, max: 0.8 },
  sizeFear: { min: 0.1, max: 1 },
  dependency: { min: 0, max: 1 },
  independenceAge: { min: 5, max: 60 },
  camo: { min: 0.05, max: 0.9 },
  awareness: { min: 0.3, max: 1 },
  fertility: { min: 0.2, max: 0.9 },
  gestationCost: { min: 5, max: 40 },
  moodStability: { min: 0.1, max: 1 },
  stamina: { min: 0.4, max: 2 },
  circadianBias: { min: -1, max: 1 },
  sleepEfficiency: { min: 0.4, max: 1.2 },
  scavengerAffinity: { min: 0, max: 1 },
  preySizeTargetRatio: { min: 0.05, max: 1.5 },
  forageStartRatio: { min: 0.35, max: 0.95 },
  eatingGreed: { min: 0, max: 1 },
  maturityAgeYears: { min: 1, max: 20 },
  cannibalism: { min: 0, max: 1 },
}

export function clampGeneValue(gene: GeneKey, value: number): number {
  const range = GENE_RANGES[gene]
  if (!range || !Number.isFinite(value)) return value
  return clamp(value, range.min, range.max)
}

export function applyGeneDominance(
  dominance: GeneDominance,
  gene: GeneKey,
  aValue: number,
  bValue: number,
  rng: () => number,
): number {
  const dom = dominance[gene] ?? 0.5
  return rng() < dom ? aValue : bValue
}

export function randomGeneValue(gene: GeneKey, rng: () => number): number {
  switch (gene) {
    case 'baseSpeed':
      return 180 + rng() * 240 // 180..420
    case 'visionRange':
      return 180 + rng() * 180 // 180..360 typical
    case 'hungerThreshold':
      return 40 + rng() * 50 // 40..90
    case 'forageStartRatio':
      return 0.45 + rng() * 0.45 // 0.45..0.9
    case 'eatingGreed':
      return rng() // 0..1
    case 'maturityAgeYears':
      return 1 + rng() * 19 // 1..20
    case 'fatCapacity':
      return 120 + rng() * 1880 // 120..2000
    case 'fatBurnThreshold':
      return 40 + rng() * 30 // 40..70
    case 'patrolThreshold':
      return 20 + rng() * 50 // 20..70 (scaled further in buildDNA)
    case 'aggression':
      return rng()
    case 'bravery':
      return rng()
    case 'power':
      return 30 + rng() * 110 // 30..140
    case 'defence':
      return 30 + rng() * 80 // 30..110
    case 'fightPersistence':
      return rng()
    case 'escapeTendency':
      return rng()
    case 'escapeDuration':
      return 1 + rng() * 3
    case 'lingerRate':
      return rng()
    case 'dangerRadius':
      return 120 + rng() * 120 // 120..240
    case 'attentionSpan':
      return 0.35 + rng() * 0.55 // 0.35..0.9
    case 'libidoThreshold':
      return 0.2 + rng() * 0.6
    case 'libidoGainRate':
      return 0.01 + rng() * 0.04
    case 'mutationRate':
      return 0.005 + rng() * 0.03
    case 'bodyMass':
      return 0.6 + rng() * 19.4 // 0.6..20
    case 'metabolism':
      return 4 + rng() * 8
    case 'turnRate':
      return 1 + rng() * 2 // 1..3
    case 'curiosity':
      return 0.3 + rng() * 0.6 // 0.3..0.9
    case 'cohesion':
      return 0.2 + rng() * 0.6 // 0.2..0.8
    case 'fear':
      return 0.2 + rng() * 0.6 // 0.2..0.8
    case 'cowardice':
      return 0.15 + rng() * 0.8 // 0.15..0.95
    case 'speciesFear':
      return 0.1 + rng() * 0.8 // 0.1..0.9
    case 'conspecificFear':
      return 0.05 + rng() * 0.5 // 0.05..0.55
    case 'sizeFear':
      return 0.2 + rng() * 0.7 // 0.2..0.9
    case 'preySizeTargetRatio':
      return 0.1 + rng() * 0.9 // 0.1..1 (preyMass / hunterMass)
    case 'dependency':
      return 0.1 + rng() * 0.8 // 0.1..0.9
    case 'independenceAge':
      return 10 + rng() * 40 // 10..50
    case 'camo':
      return 0.1 + rng() * 0.6 // 0.1..0.7
    case 'awareness':
      return 0.5 + rng() * 0.5 // 0.5..1
    case 'fertility':
      return 0.25 + rng() * 0.55 // 0.25..0.8
    case 'gestationCost':
      return 5 + rng() * 15 // 5..20
    case 'moodStability':
      return 0.2 + rng() * 0.7
    case 'stamina':
      return 0.7 + rng() * 0.7 // 0.7..1.4
    case 'circadianBias':
      return -0.8 + rng() * 1.6
    case 'sleepEfficiency':
      return 0.5 + rng() * 0.5 // 0.5..1
    case 'scavengerAffinity':
      return rng()
    case 'cannibalism':
      return rng()
    default:
      return rng()
  }
}
