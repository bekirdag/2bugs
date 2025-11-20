import type { DNA } from '@/types/sim'

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
      return 180 + rng() * 240
    case 'visionRange':
      return 120 + rng() * 260
    case 'hungerThreshold':
      return 40 + rng() * 60
    case 'fatCapacity':
      return 80 + rng() * 160
    case 'fatBurnThreshold':
      return 30 + rng() * 70
    case 'patrolThreshold':
      return 10 + rng() * 70
    case 'aggression':
      return rng()
    case 'bravery':
      return rng()
    case 'power':
      return 30 + rng() * 120
    case 'defence':
      return 20 + rng() * 90
    case 'fightPersistence':
      return rng()
    case 'escapeTendency':
      return rng()
    case 'escapeDuration':
      return 1 + rng() * 3
    case 'lingerRate':
      return rng()
    case 'dangerRadius':
      return 100 + rng() * 180
    case 'attentionSpan':
      return 0.2 + rng() * 0.8
    case 'libidoThreshold':
      return 0.2 + rng() * 0.6
    case 'libidoGainRate':
      return 0.01 + rng() * 0.04
    case 'mutationRate':
      return 0.005 + rng() * 0.03
    case 'bodyMass':
      return 0.6 + rng() * 19.4
    case 'metabolism':
      return 4 + rng() * 8
    case 'turnRate':
      return 0.5 + rng() * 2.5
    case 'curiosity':
      return 0.2 + rng() * 0.7
    case 'cohesion':
      return 0.1 + rng() * 0.7
    case 'fear':
      return 0.1 + rng() * 0.8
    case 'cowardice':
      return 0.1 + rng() * 0.9
    case 'speciesFear':
      return 0.1 + rng() * 0.9
    case 'conspecificFear':
      return 0.05 + rng() * 0.7
    case 'sizeFear':
      return 0.1 + rng() * 0.9
    case 'dependency':
      return rng() // 0..1
    case 'independenceAge':
      return 5 + rng() * 40 // in ticks/seconds proxy
    case 'camo':
      return 0.1 + rng() * 0.8
    case 'awareness':
      return 0.2 + rng() * 0.8
    case 'fertility':
      return 0.2 + rng() * 0.6
    case 'gestationCost':
      return 5 + rng() * 20
    case 'moodStability':
      return 0.2 + rng() * 0.7
    case 'stamina':
      return 0.5 + rng() * 1.5
    case 'circadianBias':
      return -0.8 + rng() * 1.6
    case 'sleepEfficiency':
      return 0.4 + rng() * 0.6
    case 'scavengerAffinity':
      return rng()
    default:
      return rng()
  }
}
