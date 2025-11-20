import { AgentMeta, DNA as DNAComp, Energy, ModeState, Position, Reproduction } from '../components'
import type { SimulationContext } from '../types'

import type { ControlState, DNA } from '@/types/sim'
import { clamp } from '@/utils/math'
import { markGeneMutation, applyGeneDominance, DEFAULT_DOMINANCE, randomGeneValue } from '../genetics'
import { BODY_PLAN_VERSION, cloneBodyPlan, createBaseBodyPlan } from '@/ecs/bodyPlan'

export interface ReproductionHooks {
  spawnOffspring(
    dna: DNA,
    position: { x: number; y: number },
    options?: { mutationMask?: number },
  ): number
}

const MODE = {
  Sleep: 1,
  Mate: 5,
} as const

export function reproductionSystem(
  ctx: SimulationContext,
  controls: ControlState,
  hooks: ReproductionHooks,
  dt: number,
) {
  const paired = new Set<number>()
  ctx.agents.forEach((entity, id) => {
    Reproduction.libido[entity] = clamp(
      Reproduction.libido[entity] + (DNAComp.fertility[entity] || 0.2) * dt,
      0,
      1,
    )
    if (ModeState.sexCooldown[entity] > 0) {
      ModeState.sexCooldown[entity] = Math.max(0, ModeState.sexCooldown[entity] - dt)
      return
    }
    if (Reproduction.libido[entity] < (Reproduction.libidoThreshold[entity] || 0.6)) return
    if (Energy.value[entity] < Energy.metabolism[entity] * 1.1) return
    if (paired.has(id)) return

    const neighbors = ctx.agentIndex.query({ x: Position.x[entity], y: Position.y[entity] }, 80)
    for (const bucket of neighbors) {
      if (bucket.id === id) continue
      if (paired.has(bucket.id)) continue
      const mateEntity = ctx.agents.get(bucket.id)
      if (mateEntity === undefined) continue
      if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) continue
      if (Reproduction.libido[mateEntity] < (Reproduction.libidoThreshold[mateEntity] || 0.6)) continue
      if (ModeState.sexCooldown[mateEntity] > 0) continue
      if (Energy.value[mateEntity] < Energy.metabolism[mateEntity] * 1.1) continue
      const dx = Position.x[entity] - Position.x[mateEntity]
      const dy = Position.y[entity] - Position.y[mateEntity]
      if (Math.sqrt(dx * dx + dy * dy) > 28) continue

      paired.add(id)
      paired.add(bucket.id)

      ModeState.mode[entity] = MODE.Mate
      ModeState.mode[mateEntity] = MODE.Mate
      Reproduction.libido[entity] = 0
      Reproduction.libido[mateEntity] = 0
      ModeState.sexCooldown[entity] = 5
      ModeState.sexCooldown[mateEntity] = 5
      Energy.value[entity] -= DNAComp.sleepNeed[entity] ?? 5
      Energy.value[mateEntity] -= DNAComp.sleepNeed[mateEntity] ?? 5

      const fertility =
        ((DNAComp.fertility[entity] ?? 0.3) + (DNAComp.fertility[mateEntity] ?? 0.3)) / 2
      if (ctx.agents.size < ctx.config.maxAgents && ctx.rng() < fertility) {
        const parentA = extractDNA(ctx, entity)
        const parentB = extractDNA(ctx, mateEntity)
        const { dna: childDNA, mutationMask } = crossoverDNA(
          ctx,
          parentA,
          parentB,
          controls.mutationRate,
        )
        const center = {
          x: (Position.x[entity] + Position.x[mateEntity]) / 2 + (ctx.rng() - 0.5) * 10,
          y: (Position.y[entity] + Position.y[mateEntity]) / 2 + (ctx.rng() - 0.5) * 10,
        }
        hooks.spawnOffspring(childDNA, center, { mutationMask })
      }

      ModeState.mode[entity] = MODE.Sleep
      ModeState.mode[mateEntity] = MODE.Sleep
      break
    }
  })
}

const NUMERIC_GENES: (keyof DNA)[] = [
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
  'camo',
  'awareness',
  'fertility',
  'gestationCost',
  'moodStability',
  'stamina',
  'circadianBias',
  'sleepEfficiency',
  'scavengerAffinity',
]

function crossoverDNA(
  ctx: SimulationContext,
  a: DNA,
  b: DNA,
  mutationRate: number,
): { dna: DNA; mutationMask: number } {
  const dominance = DEFAULT_DOMINANCE
  const child: DNA = {
    archetype: a.archetype,
    biome: ctx.rng() < 0.5 ? a.biome ?? 'land' : b.biome ?? 'land',
    familyColor: ctx.rng() < 0.5 ? a.familyColor : b.familyColor,
    baseSpeed: 0,
    visionRange: 0,
    hungerThreshold: 0,
    fatCapacity: 0,
    fatBurnThreshold: 0,
    patrolThreshold: 0,
    aggression: 0,
    bravery: 0,
    power: 0,
    defence: 0,
    fightPersistence: 0,
    escapeTendency: 0,
    escapeDuration: 0,
    lingerRate: 0,
    dangerRadius: 0,
    attentionSpan: 0,
    libidoThreshold: 0,
    libidoGainRate: 0,
    mutationRate: (a.mutationRate + b.mutationRate) / 2,
    bodyMass: 0,
    metabolism: 0,
    turnRate: 0,
    curiosity: 0,
    cohesion: 0,
    fear: 0,
    camo: 0,
    awareness: 0,
    fertility: 0,
    gestationCost: 0,
    moodStability: 0,
    preferredFood: ctx.rng() < 0.5 ? [...a.preferredFood] : [...b.preferredFood],
    stamina: 0,
    circadianBias: 0,
    sleepEfficiency: 0,
    scavengerAffinity: 0,
    senseUpkeep: 0,
    bodyPlanVersion: Math.max(a.bodyPlanVersion ?? 0, b.bodyPlanVersion ?? 0, BODY_PLAN_VERSION),
    bodyPlan: createBaseBodyPlan(a.archetype, a.biome ?? 'land'),
  }

  let mutationMask = 0
  NUMERIC_GENES.forEach((gene) => {
    child[gene] = applyGeneDominance(dominance, gene, a[gene], b[gene], ctx.rng)
  })

  const mutationRoll = ctx.rng()
  if (mutationRoll < mutationRate) {
    const targetGene = NUMERIC_GENES[Math.floor(ctx.rng() * NUMERIC_GENES.length)]
    const randomize = ctx.rng() < 0.4
    if (randomize) {
      child[targetGene] = randomGeneValue(targetGene, ctx.rng)
    } else {
      const delta = 1 + (ctx.rng() - 0.5) * 0.4
      child[targetGene] *= delta
    }
    ctx.metrics.mutations++
    mutationMask = markGeneMutation(mutationMask, targetGene)
  }

  const parentPlanA = a.bodyPlan ?? createBaseBodyPlan(a.archetype, a.biome ?? child.biome)
  const parentPlanB = b.bodyPlan ?? createBaseBodyPlan(b.archetype, b.biome ?? child.biome)
  child.bodyPlan = cloneBodyPlan(ctx.rng() < 0.5 ? parentPlanA : parentPlanB)

  return { dna: child, mutationMask }
}

function extractDNA(ctx: SimulationContext, entity: number): DNA {
  const id = AgentMeta.id[entity]
  const stored = ctx.genomes.get(id)
  if (stored) {
    return {
      ...stored,
      bodyPlan: cloneBodyPlan(stored.bodyPlan),
    }
  }
  return prepareDNA({
    archetype: decodeArchetype(AgentMeta.archetype[entity]),
    biome: 'land',
    familyColor: '#ffffff',
    baseSpeed: DNAComp.baseSpeed[entity],
    visionRange: DNAComp.visionRange[entity],
    hungerThreshold: Energy.metabolism[entity] * 8,
    fatCapacity: Energy.fatCapacity[entity],
    fatBurnThreshold: Energy.fatCapacity[entity] * 0.5,
    patrolThreshold: DNAComp.curiosity[entity] * 100,
    aggression: DNAComp.aggression[entity],
    bravery: 0.5,
    power: 80,
    defence: 50,
    fightPersistence: 0.5,
    escapeTendency: 0.5,
    escapeDuration: 2,
    lingerRate: 0.5,
    dangerRadius: DNAComp.visionRange[entity] * 0.5,
    attentionSpan: 0.5,
    libidoThreshold: Reproduction.libidoThreshold[entity] || 0.6,
    libidoGainRate: DNAComp.fertility[entity] || 0.2,
    mutationRate: DNAComp.mutationRate[entity] || 0.01,
    bodyMass: Energy.fatCapacity[entity] / 100,
    metabolism: DNAComp.sleepNeed[entity] || 8,
    turnRate: DNAComp.curiosity[entity] || 1,
    curiosity: DNAComp.curiosity[entity] || 0.3,
    cohesion: DNAComp.socialDrive[entity] || 0.3,
    fear: DNAComp.fear[entity] || 0.3,
    camo: 0.3,
    awareness: 0.5,
    fertility: DNAComp.fertility[entity] || 0.3,
    gestationCost: DNAComp.sleepNeed[entity] || 5,
    moodStability: 0.5,
    preferredFood: ['plant'],
    stamina: DNAComp.stamina ? DNAComp.stamina[entity] : 1,
    circadianBias: DNAComp.circadianBias ? DNAComp.circadianBias[entity] : 0,
    sleepEfficiency: DNAComp.sleepEfficiency ? DNAComp.sleepEfficiency[entity] : 0.8,
    scavengerAffinity: DNAComp.scavengerAffinity ? DNAComp.scavengerAffinity[entity] : 0,
    senseUpkeep: 0,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(decodeArchetype(AgentMeta.archetype[entity]), 'land'),
  })
}

function decodeArchetype(code: number): 'hunter' | 'prey' | 'scavenger' {
  switch (code) {
    case 1:
      return 'hunter'
    case 4:
      return 'scavenger'
    default:
      return 'prey'
  }
}
