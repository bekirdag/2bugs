import { AgentMeta, DNA as DNAComp, Energy, ModeState, Position, Reproduction } from '../components'
import type { SimulationContext } from '../types'

import type { ControlState, DNA } from '@/types/sim'
import { clamp } from '@/utils/math'
import {
  markGeneMutation,
  applyGeneDominance,
  DEFAULT_DOMINANCE,
  randomGeneValue,
  GENE_KEYS,
  type GeneKey,
} from '../genetics'
import { BODY_PLAN_VERSION, cloneBodyPlan, createBaseBodyPlan, prepareDNA } from '@/ecs/bodyPlan'
import { featureFlags } from '@/config/featureFlags'

export interface ReproductionHooks {
  spawnOffspring(
    dna: DNA,
    position: { x: number; y: number },
    options?: { mutationMask?: number; parentId?: number },
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
  // Resolve births for active pregnancies
  ctx.pregnancies.forEach((pending, agentId) => {
    const motherEntity = ctx.agents.get(agentId)
    if (motherEntity === undefined) {
      ctx.pregnancies.delete(agentId)
      return
    }
    if (ModeState.gestationTimer[motherEntity] <= 0) {
      const offset = {
        x: Position.x[motherEntity] + (ctx.rng() - 0.5) * 8,
        y: Position.y[motherEntity] + (ctx.rng() - 0.5) * 8,
      }
      hooks.spawnOffspring(pending.dna, offset, { mutationMask: pending.mutationMask, parentId: agentId })
      // Birth cost: energy + fat mass proportional to baby size
      const massCost = pending.dna.bodyMass * 50
      Energy.value[motherEntity] = Math.max(0, Energy.value[motherEntity] - (pending.dna.gestationCost ?? 5))
      Energy.fatStore[motherEntity] = Math.max(0, Energy.fatStore[motherEntity] - massCost)
      ctx.pregnancies.delete(agentId)
    }
  })

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
    if (ctx.pregnancies.has(id)) {
      return
    }
    const libidoThreshold = Reproduction.libidoThreshold[entity] || 0.6
    if (Reproduction.libido[entity] < libidoThreshold) return
    if (Energy.value[entity] < Energy.metabolism[entity] * 1.1) return
    if (paired.has(id)) return

    const neighbors = ctx.agentIndex.query({ x: Position.x[entity], y: Position.y[entity] }, 80)
    for (const bucket of neighbors) {
      if (bucket.id === id) continue
      if (paired.has(bucket.id)) continue
      const mateEntity = ctx.agents.get(bucket.id)
      if (mateEntity === undefined) continue
      if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) continue
      if (ctx.pregnancies.has(bucket.id)) continue
      if (Reproduction.libido[mateEntity] < (Reproduction.libidoThreshold[mateEntity] || 0.6)) continue
      if (Reproduction.libido[entity] < (Reproduction.libidoThreshold[entity] || 0.6)) continue
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
      const sexCostA = (DNAComp.gestationCost[entity] ?? 8) * 1.5
      const sexCostB = (DNAComp.gestationCost[mateEntity] ?? 8) * 1.5
      Energy.value[entity] -= sexCostA
      Energy.value[mateEntity] -= sexCostB

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
        const motherEntityId = ctx.rng() < 0.5 ? entity : mateEntity
        const motherId = AgentMeta.id[motherEntityId]
        const gestation = 6 + (childDNA.gestationCost ?? 5) * 0.6
        ModeState.gestationTimer[motherEntityId] = gestation
        ctx.pregnancies.set(motherId, { dna: childDNA, mutationMask, parentId: motherId })
      }

      ModeState.mode[entity] = MODE.Sleep
      ModeState.mode[mateEntity] = MODE.Sleep
      break
    }
  })
}

const NUMERIC_GENES: GeneKey[] = [...GENE_KEYS]

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
    dependency: 0,
    independenceAge: 0,
    camo: 0,
    awareness: 0,
    speciesFear: 0,
    conspecificFear: 0,
    sizeFear: 0,
    cowardice: 0,
    fertility: 0,
    gestationCost: 0,
    moodStability: 0,
    preferredFood: [],
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

  const biomeMutationBias = child.biome === 'water' ? 0.3 : child.biome === 'air' ? 0.35 : 0.2
  const mutationRoll = ctx.rng()
  if (mutationRoll < mutationRate) {
    const mutateBodyPlan = ctx.rng() < biomeMutationBias
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
    if (mutateBodyPlan && child.bodyPlan) {
      mutateBodyPlanGenes(child, ctx)
      mutationMask |= 0x80000000 // track body-plan tweaks with a high bit outside the gene set
    }
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
    dependency: DNAComp.dependency ? DNAComp.dependency[entity] : 0.5,
    independenceAge: DNAComp.independenceAge ? DNAComp.independenceAge[entity] : 20,
    cowardice: DNAComp.cowardice ? DNAComp.cowardice[entity] : DNAComp.fear[entity] || 0.3,
    camo: 0.3,
    awareness: 0.5,
    fertility: DNAComp.fertility[entity] || 0.3,
    gestationCost: DNAComp.gestationCost ? DNAComp.gestationCost[entity] : DNAComp.sleepNeed[entity] || 5,
    moodStability: 0.5,
    preferredFood: ['plant'],
    stamina: DNAComp.stamina ? DNAComp.stamina[entity] : 1,
    circadianBias: DNAComp.circadianBias ? DNAComp.circadianBias[entity] : 0,
    sleepEfficiency: DNAComp.sleepEfficiency ? DNAComp.sleepEfficiency[entity] : 0.8,
    scavengerAffinity: DNAComp.scavengerAffinity ? DNAComp.scavengerAffinity[entity] : 0,
    senseUpkeep: 0,
    speciesFear: DNAComp.speciesFear ? DNAComp.speciesFear[entity] : DNAComp.fear[entity] ?? 0.4,
    conspecificFear: DNAComp.conspecificFear ? DNAComp.conspecificFear[entity] : 0.25,
    sizeFear: DNAComp.sizeFear ? DNAComp.sizeFear[entity] : 0.5,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(decodeArchetype(AgentMeta.archetype[entity]), 'land'),
  })
}

function mutateBodyPlanGenes(dna: DNA, ctx: SimulationContext) {
  const plan = dna.bodyPlan
  if (!plan) return
  const roll = ctx.rng()
  if (roll < 0.4) {
    if (!plan.senses.length) {
      plan.senses.push({ sense: 'eye', count: 1, distribution: 'head', acuity: 0.5 })
    } else {
      const sense = plan.senses[Math.floor(ctx.rng() * plan.senses.length)]
      sense.count = clamp(sense.count + (ctx.rng() < 0.5 ? -1 : 1), 0, 6)
      sense.acuity = clamp(sense.acuity + (ctx.rng() - 0.5) * 0.2, 0.1, 1)
    }
    return
  }

  if (dna.biome === 'land' && featureFlags.landBodyPlan) {
    let leg = plan.limbs.find((limb) => limb.kind === 'leg')
    if (!leg) {
      plan.limbs.push({ kind: 'leg', count: 2, size: 0.6, placement: 'mid', gaitStyle: 0.5 })
    } else {
      leg.count = clamp(leg.count + (ctx.rng() < 0.5 ? -1 : 1), 2, 6)
      leg.size = clamp(leg.size + (ctx.rng() - 0.5) * 0.2, 0.2, 1)
      leg.gaitStyle = clamp(leg.gaitStyle + (ctx.rng() - 0.5) * 0.3, 0.1, 1)
    }
    return
  }

  if (dna.biome === 'water' && featureFlags.aquaticBodyPlan) {
    const fins = plan.appendages.filter((appendage) => appendage.kind === 'fin')
    if (!fins.length) {
      plan.appendages.push({
        kind: 'fin',
        count: 2,
        size: 0.5,
        placement: 'lateral',
        steeringBias: 0.5,
      })
    } else {
      const fin = fins[Math.floor(ctx.rng() * fins.length)]
      fin.count = clamp(fin.count + (ctx.rng() < 0.5 ? -1 : 1), 1, 4)
      fin.size = clamp(fin.size + (ctx.rng() - 0.5) * 0.2, 0.2, 1.2)
      fin.steeringBias = clamp(fin.steeringBias + (ctx.rng() - 0.5) * 0.2, 0.1, 1)
    }
    return
  }

  if (dna.biome === 'air' && featureFlags.aerialBodyPlan) {
    let wing = plan.limbs.find((limb) => limb.kind === 'wing')
    if (!wing) {
      plan.limbs.push({ kind: 'wing', count: 2, span: 0.7, surface: 0.6, articulation: 0.5 })
    } else {
      wing.span = clamp(wing.span + (ctx.rng() - 0.5) * 0.2, 0.3, 1.2)
      wing.surface = clamp(wing.surface + (ctx.rng() - 0.5) * 0.2, 0.3, 1.2)
      wing.articulation = clamp(wing.articulation + (ctx.rng() - 0.5) * 0.2, 0.2, 1)
    }
  }
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

function genomeSimilarity(a: DNA, b: DNA): number {
  if (a.archetype !== b.archetype) return 0
  let total = 0
  let count = 0
  GENE_KEYS.forEach((key) => {
    const av = a[key] as number
    const bv = b[key] as number
    if (typeof av !== 'number' || typeof bv !== 'number') return
    const denom = Math.max(Math.abs(av) + Math.abs(bv), 1e-5)
    const diff = Math.abs(av - bv) / denom
    const sim = 1 - Math.min(diff * 2, 1) // looser tolerance
    total += sim
    count++
  })
  if (count === 0) return 0
  return total / count
}
