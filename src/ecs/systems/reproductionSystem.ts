import { AgentMeta, Body, DNA as DNAComp, Energy, Heading, ModeState, Position, Reproduction } from '../components'
import type { SimulationContext } from '../types'

import type { ControlState, DNA, OrganPlacement, LegMount } from '@/types/sim'
import { clamp } from '@/utils/math'
import {
  markGeneMutation,
  clampGeneValue,
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
      // Birth cost: scale with baby size and mother size so large mothers/babies cost more.
      const motherMass = clamp(
        Body.mass[motherEntity] || (Energy.fatCapacity[motherEntity] || 120) / 120,
        0.2,
        80,
      )
      const childMass = Math.max(0.1, pending.dna.bodyMass)
      const massRatio = clamp(childMass / Math.max(motherMass, 0.2), 0.4, 1.6)
      const sizeFactor = clamp(Math.pow(motherMass, 0.35), 0.6, 3.2)
      const gestationCost = pending.dna.gestationCost ?? 5
      const energyCost = gestationCost * sizeFactor * (0.6 + massRatio * 0.6)
      const massCost = childMass * 35 * (0.6 + massRatio * 0.6)
      Energy.value[motherEntity] = Math.max(0, Energy.value[motherEntity] - energyCost)
      Energy.fatStore[motherEntity] = Math.max(0, Energy.fatStore[motherEntity] - massCost)
      ctx.pregnancies.delete(agentId)
    }
  })

  ctx.agents.forEach((entity, id) => {
    if (ModeState.sexCooldown[entity] > 0) {
      return
    }
    // Mating is intent-driven: only try to reproduce if the agent is currently in mate mode and
    // explicitly targeting a mate (set by the perception/mood system).
    if (ModeState.mode[entity] !== MODE.Mate) return
    if (ModeState.targetType[entity] !== 1 || !ModeState.targetId[entity]) return

    const selfGenome = ctx.genomes.get(id)
    const birthTick = ctx.birthTick.get(id) ?? ctx.tick
    const yearTicks = Math.max(1, ctx.yearTicks || 2400)
    const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
    const reproductionMaturityAgeYears = clampGeneValue(
      'reproductionMaturityAgeYears',
      selfGenome?.reproductionMaturityAgeYears ?? selfGenome?.maturityAgeYears ?? 0,
    )
    if (ageYears < reproductionMaturityAgeYears) return

    const targetMateId = ModeState.targetId[entity]
    const mateEntity = ctx.agents.get(targetMateId)
    if (mateEntity === undefined) return
    const mateGenome = ctx.genomes.get(targetMateId)
    const mateBirthTick = ctx.birthTick.get(targetMateId) ?? ctx.tick
    const mateAgeYears = Math.max(0, ctx.tick - mateBirthTick) / yearTicks
    const mateReproductionMaturityAgeYears = clampGeneValue(
      'reproductionMaturityAgeYears',
      mateGenome?.reproductionMaturityAgeYears ?? mateGenome?.maturityAgeYears ?? 0,
    )
    if (mateAgeYears < mateReproductionMaturityAgeYears) return
    if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) return
    const selfBiome = selfGenome?.biome ?? 'land'
    const mateBiome = mateGenome?.biome ?? 'land'
    if (mateBiome !== selfBiome) return
    if (ctx.pregnancies.has(targetMateId)) return

    const dx = Position.x[entity] - Position.x[mateEntity]
    const dy = Position.y[entity] - Position.y[mateEntity]
    const mateRangeValue = selfGenome?.mateRange ?? DNAComp.mateRange[entity]
    if (!Number.isFinite(mateRangeValue)) return
    const mateRange = clampGeneValue('mateRange', mateRangeValue)
    if (Math.sqrt(dx * dx + dy * dy) > mateRange) return

    Reproduction.libido[entity] = 0
    Reproduction.libido[mateEntity] = 0
    const selfCooldown = clampGeneValue('mateCooldownDuration', selfGenome?.mateCooldownDuration ?? 0)
    const mateCooldown = clampGeneValue('mateCooldownDuration', mateGenome?.mateCooldownDuration ?? 0)
    ModeState.sexCooldown[entity] = selfCooldown
    ModeState.sexCooldown[mateEntity] = mateCooldown
    const mateCostScaleA = clampGeneValue('mateEnergyCostScale', selfGenome?.mateEnergyCostScale ?? 0)
    const mateCostScaleB = clampGeneValue('mateEnergyCostScale', mateGenome?.mateEnergyCostScale ?? 0)
    const sexCostA = (DNAComp.gestationCost[entity] ?? 0) * mateCostScaleA
    const sexCostB = (DNAComp.gestationCost[mateEntity] ?? 0) * mateCostScaleB
    Energy.value[entity] = Math.max(0, Energy.value[entity] - sexCostA)
    Energy.value[mateEntity] = Math.max(0, Energy.value[mateEntity] - sexCostB)

    const parentA = extractDNA(ctx, entity)
    const parentB = extractDNA(ctx, mateEntity)
    const { dna: childDNA, mutationMask } = crossoverDNA(ctx, parentA, parentB, controls.mutationRate)
    childDNA.maturityAgeYears = clamp(childDNA.maturityAgeYears ?? 1, 1, 20)
    childDNA.reproductionMaturityAgeYears = clamp(childDNA.reproductionMaturityAgeYears ?? 0.5, 0.1, 6)
    const motherEntityId = mateEntity
    const motherId = AgentMeta.id[motherEntityId]
    const mateGestationBase = clampGeneValue('mateGestationBase', mateGenome?.mateGestationBase ?? 0)
    const mateGestationScale = clampGeneValue('mateGestationScale', mateGenome?.mateGestationScale ?? 0)
    const gestation = mateGestationBase + (childDNA.gestationCost ?? 0) * mateGestationScale
    ModeState.gestationTimer[motherEntityId] = gestation
    ctx.pregnancies.set(motherId, { dna: childDNA, mutationMask, parentId: motherId })
  })
}

const NUMERIC_GENES: GeneKey[] = [...GENE_KEYS]

function rad(deg: number) {
  return (deg * Math.PI) / 180
}

function wrapAngle(angle: number) {
  if (!Number.isFinite(angle)) return 0
  const tau = Math.PI * 2
  return ((angle % tau) + tau) % tau
}

function clampPlacement(p: OrganPlacement): OrganPlacement {
  return {
    x: clamp(p.x, -0.65, 0.65),
    y: clamp(p.y, -0.65, 0.65),
    angle: wrapAngle(p.angle),
  }
}

function mutatePlacement(p: OrganPlacement, rng: () => number, magnitude = 1): OrganPlacement {
  const angleDelta = (rng() - 0.5) * rad(35) * magnitude
  const posDelta = (rng() - 0.5) * 0.12 * magnitude
  return clampPlacement({
    x: p.x + posDelta,
    y: p.y + (rng() - 0.5) * 0.12 * magnitude,
    angle: p.angle + angleDelta,
  })
}

function mutateMounts(mounts: LegMount[], rng: () => number, magnitude = 1) {
  for (let i = 0; i < mounts.length; i++) {
    const mount = mounts[i]!
    if (rng() > 0.55) continue
    const delta = (rng() - 0.5) * 0.18 * magnitude
    mounts[i] = {
      x: clamp(mount.x + delta, -0.6, 0.6),
      side: mount.side,
    }
  }
  if (mounts.length >= 4 && rng() < 0.15) {
    // Occasional symmetry flip.
    for (let i = 0; i < mounts.length; i++) {
      mounts[i] = { ...mounts[i]!, side: (mounts[i]!.side === -1 ? 1 : -1) as -1 | 1 }
    }
  }
}

function crossoverDNA(
  ctx: SimulationContext,
  a: DNA,
  b: DNA,
  globalMutationRate: number,
): { dna: DNA; mutationMask: number } {
  const childBiome = ctx.rng() < 0.5 ? a.biome ?? 'land' : b.biome ?? 'land'
  const child: DNA = {
    archetype: a.archetype,
    biome: childBiome,
    familyColor: ctx.rng() < 0.5 ? a.familyColor : b.familyColor,
    baseSpeed: 0,
    visionRange: 0,
    hungerThreshold: 0,
    hungerRestMultiplier: 0,
    hungerSurvivalBufferScale: 0,
    growthReserveBase: 0,
    growthReserveGreedScale: 0,
    satiationBase: 0,
    satiationGreedScale: 0,
    patrolThresholdMinScale: 0,
    patrolThresholdMaxScale: 0,
    initialEnergyBirthMultiplier: 0,
    initialEnergySeedMultiplier: 0,
    forageStartRatio: 0,
    eatingGreed: 0,
    foragePressureBase: 0,
    foragePressureVolatility: 0,
    greedForageThreshold: 0,
    greedForageWeight: 0,
    greedForagePressureThreshold: 0,
    foragePressureSoftGate: 0,
    foragePressureExhaustionBuffer: 0,
    sleepPressureWeight: 0,
    exhaustionPressureBase: 0,
    exhaustionPressureStability: 0,
    forageIntensityThreshold: 0,
    sleepThresholdBase: 0,
    sleepThresholdStability: 0,
    sleepDebtMax: 0,
    sleepDebtGainScale: 0,
    sleepDebtStaminaFloor: 0,
    sleepEfficiencyBaseline: 0,
    sleepEfficiencyFactorBase: 0,
    sleepEfficiencyEffectScale: 0,
    sleepEfficiencyFactorMin: 0,
    sleepEfficiencyFactorMax: 0,
    sleepPressureRecoveryWeight: 0,
    sleepRecoveryScaleSleep: 0,
    sleepRecoveryScaleRecover: 0,
    sleepFatigueRecoveryScaleSleep: 0,
    sleepFatigueRecoveryScaleRecover: 0,
    sleepFatigueGainScale: 0,
    sleepStaminaFactorBase: 0,
    sleepStaminaFactorOffset: 0,
    sleepStaminaFactorScale: 0,
    sleepStaminaFactorMin: 0,
    sleepStaminaFactorMax: 0,
    sleepCircadianRestThreshold: 0,
    sleepCircadianStressScale: 0,
    sleepCircadianPushScale: 0,
    sleepCircadianPreferenceMidpoint: 0,
    digestionThresholdBase: 0,
    digestionThresholdStability: 0,
    recoveryThresholdBase: 0,
    recoveryThresholdStability: 0,
    greedHungerOffset: 0,
    plantHungerBoostThreshold: 0,
    plantHungerBoost: 0,
    keepEatingMultiplier: 0,
    grazeBiteBase: 0,
    grazeBiteGreedScale: 0,
    grazeBiteMin: 0,
    grazeBiteMax: 0,
    grazeMinBiomass: 0,
    grazeRemoveBiomass: 0,
    grazeTargetMinBiomass: 0,
    grazeMoistureLoss: 0,
    grazeEnergyMultiplier: 0,
    grazeHungerBase: 0,
    grazeHungerCuriosityScale: 0,
    grazeCuriosityForageThreshold: 0,
    grazeSearchRadiusBase: 0,
    grazeSearchRadiusCuriosityScale: 0,
    grazeScoreBiomassWeight: 0,
    grazeScoreNutrientWeight: 0,
    grazeDistanceFloor: 0,
    grazeHungerRatioThreshold: 0,
    grazeHungerRatioNoPreyThreshold: 0,
    grazeTargetWeightBase: 0,
    grazeTargetFatCapacityWeight: 0,
    grazeTargetHungerBoostBase: 0,
    huntPreyHungerRatioThreshold: 0,
    huntTargetDistanceFloor: 0,
    huntTargetFocusBase: 0,
    huntTargetFocusScale: 0,
    huntTargetAggressionBase: 0,
    huntTargetAggressionScale: 0,
    huntTargetAwarenessBase: 0,
    huntTargetAwarenessScale: 0,
    huntPreySizeBandScale: 0,
    huntPreySizeBandOffset: 0,
    huntPreySizeBandMin: 0,
    huntPreySizeBandMax: 0,
    huntPreySizeBiasBase: 0,
    huntPreySizeBiasMin: 0,
    huntPreySizeBiasMax: 0,
    huntPreySizeOverageBase: 0,
    huntPreySizeOverageThreshold: 0,
    huntPreySizeOverageMin: 0,
    huntPreySizeOverageMax: 0,
    huntStickinessLingerBase: 0,
    huntStickinessLingerScale: 0,
    huntStickinessAttentionBase: 0,
    huntStickinessAttentionScale: 0,
    huntCarrionHungerRatioThreshold: 0,
    huntCarrionNutrientsMin: 0,
    huntCarrionDistanceFloor: 0,
    huntCarrionFocusBase: 0,
    huntCarrionFocusScale: 0,
    huntCarrionHungerBase: 0,
    huntCarrionHungerScale: 0,
    huntCarrionAffinityBase: 0,
    huntCarrionAffinityScale: 0,
    huntCarrionNutrientBase: 0,
    huntCarrionNutrientScale: 0,
    huntCarrionNutrientNorm: 0,
    huntCarrionNutrientClampMax: 0,
    huntCarrionPreferWeight: 0,
    huntCorpseReachScale: 0,
    huntCorpseReachMin: 0,
    huntCorpseReachMax: 0,
    fightInitiativeAggressionWeight: 0,
    fightInitiativeSizeWeight: 0,
    fightInitiativeRandomWeight: 0,
    fightInitiativeBiasWeight: 0,
    fightExchangeCount: 0,
    fightLeverageExponent: 0,
    fightVariabilityBase: 0,
    fightVariabilityScale: 0,
    fightBaseDamage: 0,
    fightDamageCap: 0,
    scavengeBiteBase: 0,
    scavengeBiteMassScale: 0,
    scavengeBiteGreedBase: 0,
    scavengeBiteMin: 0,
    scavengeBiteMax: 0,
    scavengeMinNutrients: 0,
    fleeFearBiasFearWeight: 0,
    fleeFearBiasCowardiceWeight: 0,
    fleeSurvivalThreatBase: 0,
    fleeSurvivalThreatFearScale: 0,
    fleeSurvivalStabilityBase: 0,
    fleeSurvivalStabilityScale: 0,
    fleeSurvivalStressWeight: 0,
    fleeSurvivalThresholdBase: 0,
    fleeSurvivalThresholdStabilityScale: 0,
    fleeFightDriveAggressionWeight: 0,
    fleeFightDrivePersistenceWeight: 0,
    fleeBraveFearOffset: 0,
    fleeBraveThreatThreshold: 0,
    fleeEscapeDurationMin: 0,
    fleeEscapeDurationMax: 0,
    fleeEscapeTendencyMin: 0,
    fleeEscapeTendencyMax: 0,
    fleeSizeRatioOffset: 0,
    fleeSizeDeltaMin: 0,
    fleeSizeDeltaMax: 0,
    fleeSizeMultiplierBase: 0,
    fleeSizeMultiplierMin: 0,
    fleeSizeMultiplierMax: 0,
    fleePredatorScaleOffset: 0,
    fleePredatorScaleRange: 0,
    fleeThreatProximityBase: 0,
    fleeThreatDistanceFloor: 0,
    fleeThreatProximityWeight: 0,
    fleeThreatAwarenessWeight: 0,
    fleeThreatCowardiceWeight: 0,
    fleeThreatScoreMax: 0,
    fleeCowardiceClampMax: 0,
    fleeSpeedFloor: 0,
    fleeTriggerAwarenessWeight: 0,
    fleeTriggerFearWeight: 0,
    fleeTriggerCourageWeight: 0,
    fleeTriggerNormalization: 0,
    fleeTriggerClampMin: 0,
    fleeTriggerClampMax: 0,
    fleeDangerTimerMin: 0,
    fleeDangerHoldIntensityOffset: 0,
    fleeDangerHoldIntensityMin: 0,
    fleeDangerHoldIntensityMax: 0,
    fleeDangerIntensityBase: 0,
    fleeDangerDecayStep: 0,
    fleeDangerDecayBase: 0,
    fleeDangerDecayAttentionOffset: 0,
    fleeDangerDecayAttentionScale: 0,
    fleeDangerDecayMin: 0,
    fleeDangerDecayMax: 0,
    fleeSpeedBoostBase: 0,
    fleeSpeedBoostStaminaScale: 0,
    maturityAgeYears: 0,
    reproductionMaturityAgeYears: 0,
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
    libidoPressureBase: 0,
    libidoPressureStabilityWeight: 0,
    mateSearchLibidoRatioThreshold: 0,
    mateSearchTurnJitterScale: 0,
    mateSearchTurnChanceBase: 0,
    mateSearchTurnChanceCuriosityScale: 0,
    mateCooldownDuration: 0,
    mateCooldownScaleBase: 0,
    mateCooldownFertilityScale: 0,
    mateCooldownScaleMin: 0,
    mateCooldownScaleMax: 0,
    mateEnergyCostScale: 0,
    mateGestationBase: 0,
    mateGestationScale: 0,
    patrolHerdCohesionWeight: 0,
    patrolHerdDependencyWeight: 0,
    patrolSocialPressureBase: 0,
    patrolSocialPressureStabilityWeight: 0,
    patrolSocialThresholdBase: 0,
    patrolSocialThresholdStabilityWeight: 0,
    patrolSpeedMultiplier: 0,
    curiosityDriveBase: 0,
    curiosityDriveStabilityWeight: 0,
    exploreThreshold: 0,
    idleDriveBase: 0,
    idleDriveStabilityWeight: 0,
    idleThreshold: 0,
    mateRange: 0,
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
    preySizeTargetRatio: 0,
    cowardice: 0,
    fertility: 0,
    gestationCost: 0,
    moodStability: 0,
    cannibalism: 0,
    terrainPreference: 0,
    preferredFood: [],
    stamina: 0,
    circadianBias: 0,
    sleepEfficiency: 0,
    scavengerAffinity: 0,
    senseUpkeep: 0,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(a.archetype, 'land'),
  }

  const parentPlanA = a.bodyPlan ?? createBaseBodyPlan(a.archetype, a.biome ?? childBiome)
  const parentPlanB = b.bodyPlan ?? createBaseBodyPlan(b.archetype, b.biome ?? childBiome)
  const planCandidates: Array<DNA['bodyPlan']> = []
  if ((a.biome ?? childBiome) === childBiome) planCandidates.push(parentPlanA)
  if ((b.biome ?? childBiome) === childBiome) planCandidates.push(parentPlanB)
  const selectedPlan = planCandidates.length
    ? planCandidates[Math.floor(ctx.rng() * planCandidates.length)]
    : createBaseBodyPlan(child.archetype, childBiome)
  child.bodyPlan = cloneBodyPlan(selectedPlan)
  child.bodyPlanVersion = BODY_PLAN_VERSION

  let mutationMask = 0
  const geneCount = NUMERIC_GENES.length
  const hasCuts = geneCount >= 3
  const firstCut = hasCuts ? 1 + Math.floor(ctx.rng() * (geneCount - 2)) : 0
  const secondCut = hasCuts ? firstCut + 1 + Math.floor(ctx.rng() * (geneCount - firstCut - 1)) : geneCount
  const segmentParents: [DNA, DNA, DNA] = [
    ctx.rng() < 0.5 ? a : b,
    ctx.rng() < 0.5 ? a : b,
    ctx.rng() < 0.5 ? a : b,
  ]
  if (segmentParents[0] === segmentParents[1] && segmentParents[1] === segmentParents[2]) {
    const swapIndex = Math.floor(ctx.rng() * 3)
    segmentParents[swapIndex] = segmentParents[swapIndex] === a ? b : a
  }
  for (let i = 0; i < geneCount; i++) {
    const gene = NUMERIC_GENES[i]
    const source = i < firstCut ? segmentParents[0] : i < secondCut ? segmentParents[1] : segmentParents[2]
    const fallback = source === a ? b : a
    const value = source[gene] ?? fallback[gene] ?? randomGeneValue(gene, ctx.rng)
    child[gene] = clampGeneValue(gene, value)
  }

  // Combine global UI control with the heritable mutation-rate gene.
  // `globalMutationRate` is the user slider (typical 0.001..0.1), while `a/b.mutationRate` is a per-lineage modifier.
  // We treat `0.01` as the “baseline” genetic rate and scale around it.
  const BASE_MUTATION_GENE = 0.01
  const geneticRate = clamp(((a.mutationRate ?? BASE_MUTATION_GENE) + (b.mutationRate ?? BASE_MUTATION_GENE)) / 2, 0, 1)
  const effectiveMutationRate = clamp(
    globalMutationRate * (geneticRate / BASE_MUTATION_GENE),
    0,
    1,
  )

  const mutationRoll = ctx.rng()
  if (mutationRoll < effectiveMutationRate) {
    const targetGene = NUMERIC_GENES[Math.floor(ctx.rng() * NUMERIC_GENES.length)]
    const randomize = ctx.rng() < 0.4
    if (randomize) {
      child[targetGene] = randomGeneValue(targetGene, ctx.rng)
    } else {
      const delta = 1 + (ctx.rng() - 0.5) * 0.4
      child[targetGene] *= delta
    }
    child[targetGene] = clampGeneValue(targetGene, child[targetGene])
    ctx.metrics.mutations++
    mutationMask = markGeneMutation(mutationMask, targetGene)
  }

  applyGeneConstraints(child)
  return { dna: prepareDNA(child), mutationMask }
}

function applyGeneConstraints(child: DNA) {
  child.fatCapacity = clampGeneValue('fatCapacity', child.fatCapacity)
  child.fatBurnThreshold = clampGeneValue('fatBurnThreshold', child.fatBurnThreshold)
  if (Number.isFinite(child.fatCapacity) && child.fatCapacity > 0) {
    child.fatBurnThreshold = clamp(
      child.fatBurnThreshold,
      child.fatCapacity * 0.15,
      child.fatCapacity * 0.85,
    )
  }
  child.hungerThreshold = clampGeneValue('hungerThreshold', child.hungerThreshold)
  child.patrolThreshold = clampGeneValue('patrolThreshold', child.patrolThreshold)
  if (Number.isFinite(child.hungerThreshold) && child.hungerThreshold > 0) {
    const patrolThresholdMinScale = clampGeneValue(
      'patrolThresholdMinScale',
      child.patrolThresholdMinScale ?? 0,
    )
    const patrolThresholdMaxScale = clampGeneValue(
      'patrolThresholdMaxScale',
      child.patrolThresholdMaxScale ?? 0,
    )
    child.patrolThreshold = clamp(
      child.patrolThreshold,
      child.hungerThreshold * patrolThresholdMinScale,
      child.hungerThreshold * patrolThresholdMaxScale,
    )
  }
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
  const archetype = decodeArchetype(AgentMeta.archetype[entity])
  const familyColor = `#${AgentMeta.familyColor[entity].toString(16).padStart(6, '0')}`
  const curiosity = DNAComp.curiosity[entity] ?? 0.3
  const fear = DNAComp.fear[entity] ?? 0.3
  const aggression = DNAComp.aggression[entity] ?? 0.3
  const vision = DNAComp.visionRange[entity] || 200
  const metabolism = DNAComp.metabolism[entity] || Energy.metabolism[entity] || 8
  const hungerThreshold = clampGeneValue(
    'hungerThreshold',
    DNAComp.hungerThreshold ? DNAComp.hungerThreshold[entity] : randomGeneValue('hungerThreshold', ctx.rng),
  )
  const fatCapacity = DNAComp.fatCapacity ? DNAComp.fatCapacity[entity] || 120 : Energy.fatCapacity[entity] || 120
  const bodyMass = Body.mass[entity] || fatCapacity / 120
  const maturityAgeYears = clamp(
    1 + Math.pow(clamp(bodyMass, 0.2, 80), 0.55) * 2.8 + (archetype === 'hunter' ? 1.6 : archetype === 'scavenger' ? 1 : 0),
    1,
    20,
  )
  const reproductionMaturityAgeYears = clamp(Math.min(6, maturityAgeYears * 0.5), 0.1, 6)
  return prepareDNA({
    archetype,
    biome: 'land',
    familyColor,
    baseSpeed:
      (DNAComp.baseSpeed ? DNAComp.baseSpeed[entity] : 0) || randomGeneValue('baseSpeed', ctx.rng),
    visionRange: vision,
    hungerThreshold,
    hungerRestMultiplier: 1.5,
    hungerSurvivalBufferScale: 0.08,
    growthReserveBase: 0.95,
    growthReserveGreedScale: 0.35,
    satiationBase: 0.9,
    satiationGreedScale: 1.3,
    patrolThresholdMinScale: 0.2,
    patrolThresholdMaxScale: 1.2,
    initialEnergyBirthMultiplier: 2.5,
    initialEnergySeedMultiplier: 3,
    forageStartRatio: clamp(0.55 + curiosity * 0.35, 0.35, 0.95),
    eatingGreed: clamp(0.4 + curiosity * 0.8, 0, 1),
    foragePressureBase: 0.8,
    foragePressureVolatility: 0.4,
    greedForageThreshold: 0.55,
    greedForageWeight: 0.5,
    greedForagePressureThreshold: 0.5,
    foragePressureSoftGate: 0.6,
    foragePressureExhaustionBuffer: 0.1,
    sleepPressureWeight: 0.8,
    exhaustionPressureBase: 1.05,
    exhaustionPressureStability: 0.05,
    forageIntensityThreshold: 0.8,
    sleepThresholdBase: 0.55,
    sleepThresholdStability: 0.1,
    sleepDebtMax: 5,
    sleepDebtGainScale: 1,
    sleepDebtStaminaFloor: 0.5,
    sleepEfficiencyBaseline: 0.8,
    sleepEfficiencyFactorBase: 1.1,
    sleepEfficiencyEffectScale: 0.5,
    sleepEfficiencyFactorMin: 0.6,
    sleepEfficiencyFactorMax: 1.4,
    sleepPressureRecoveryWeight: 0.35,
    sleepRecoveryScaleSleep: 1,
    sleepRecoveryScaleRecover: 0.45,
    sleepFatigueRecoveryScaleSleep: 0.4,
    sleepFatigueRecoveryScaleRecover: 0.25,
    sleepFatigueGainScale: 0.2,
    sleepStaminaFactorBase: 1.15,
    sleepStaminaFactorOffset: 1,
    sleepStaminaFactorScale: 0.6,
    sleepStaminaFactorMin: 0.5,
    sleepStaminaFactorMax: 1.5,
    sleepCircadianRestThreshold: 0.35,
    sleepCircadianStressScale: 0.25,
    sleepCircadianPushScale: 0.6,
    sleepCircadianPreferenceMidpoint: 0.5,
    digestionThresholdBase: 0.55,
    digestionThresholdStability: 0.1,
    recoveryThresholdBase: 0.5,
    recoveryThresholdStability: 0.08,
    greedHungerOffset: 0.35,
    plantHungerBoostThreshold: 0.55,
    plantHungerBoost: 1.2,
    keepEatingMultiplier: 1.25,
    grazeBiteBase: 0.35,
    grazeBiteGreedScale: 0.9,
    grazeBiteMin: 0.2,
    grazeBiteMax: 1.4,
    grazeMinBiomass: 0.01,
    grazeRemoveBiomass: 0.1,
    grazeTargetMinBiomass: 0.12,
    grazeMoistureLoss: 0.35,
    grazeEnergyMultiplier: 120,
    grazeHungerBase: 1,
    grazeHungerCuriosityScale: 0.4,
    grazeCuriosityForageThreshold: 0.55,
    grazeSearchRadiusBase: 80,
    grazeSearchRadiusCuriosityScale: 220,
    grazeScoreBiomassWeight: 0.7,
    grazeScoreNutrientWeight: 0.3,
    grazeDistanceFloor: 1,
    grazeHungerRatioThreshold: 0.9,
    grazeHungerRatioNoPreyThreshold: 1,
    grazeTargetWeightBase: 1,
    grazeTargetFatCapacityWeight: 0.2,
    grazeTargetHungerBoostBase: 1,
    huntPreyHungerRatioThreshold: 1.1,
    huntTargetDistanceFloor: 1,
    huntTargetFocusBase: 0.6,
    huntTargetFocusScale: 0.4,
    huntTargetAggressionBase: 1,
    huntTargetAggressionScale: 0.4,
    huntTargetAwarenessBase: 0,
    huntTargetAwarenessScale: 1,
    huntPreySizeBandScale: 0.8,
    huntPreySizeBandOffset: 0.15,
    huntPreySizeBandMin: 0.15,
    huntPreySizeBandMax: 1.5,
    huntPreySizeBiasBase: 1,
    huntPreySizeBiasMin: 0.05,
    huntPreySizeBiasMax: 1.15,
    huntPreySizeOverageBase: 1,
    huntPreySizeOverageThreshold: 1,
    huntPreySizeOverageMin: 0.05,
    huntPreySizeOverageMax: 1,
    huntStickinessLingerBase: 1,
    huntStickinessLingerScale: 0.75,
    huntStickinessAttentionBase: 1,
    huntStickinessAttentionScale: 0.4,
    huntCarrionHungerRatioThreshold: 0.85,
    huntCarrionNutrientsMin: 0.1,
    huntCarrionDistanceFloor: 1,
    huntCarrionFocusBase: 0.65,
    huntCarrionFocusScale: 0.35,
    huntCarrionHungerBase: 0.85,
    huntCarrionHungerScale: 1.3,
    huntCarrionAffinityBase: 0.85,
    huntCarrionAffinityScale: 0.6,
    huntCarrionNutrientBase: 0.7,
    huntCarrionNutrientScale: 1,
    huntCarrionNutrientNorm: 420,
    huntCarrionNutrientClampMax: 1.5,
    huntCarrionPreferWeight: 0.9,
    huntCorpseReachScale: 0.35,
    huntCorpseReachMin: 0,
    huntCorpseReachMax: 120,
    fightInitiativeAggressionWeight: 0.55,
    fightInitiativeSizeWeight: 0.55,
    fightInitiativeRandomWeight: 0.25,
    fightInitiativeBiasWeight: 0.5,
    fightExchangeCount: 4,
    fightLeverageExponent: 4,
    fightVariabilityBase: 0.85,
    fightVariabilityScale: 0.3,
    fightBaseDamage: 10,
    fightDamageCap: 220,
    scavengeBiteBase: 14,
    scavengeBiteMassScale: 6,
    scavengeBiteGreedBase: 0.55,
    scavengeBiteMin: 8,
    scavengeBiteMax: 220,
    scavengeMinNutrients: 0.1,
    fleeFearBiasFearWeight: 0.6,
    fleeFearBiasCowardiceWeight: 0.4,
    fleeSurvivalThreatBase: 0.65,
    fleeSurvivalThreatFearScale: 0.7,
    fleeSurvivalStabilityBase: 1.1,
    fleeSurvivalStabilityScale: 0.2,
    fleeSurvivalStressWeight: 0.15,
    fleeSurvivalThresholdBase: 0.45,
    fleeSurvivalThresholdStabilityScale: 0.12,
    fleeFightDriveAggressionWeight: 0.65,
    fleeFightDrivePersistenceWeight: 0.35,
    fleeBraveFearOffset: 0.15,
    fleeBraveThreatThreshold: 0.45,
    fleeEscapeDurationMin: 0.5,
    fleeEscapeDurationMax: 12,
    fleeEscapeTendencyMin: 0.01,
    fleeEscapeTendencyMax: 2,
    fleeSizeRatioOffset: 1,
    fleeSizeDeltaMin: -0.95,
    fleeSizeDeltaMax: 3,
    fleeSizeMultiplierBase: 1,
    fleeSizeMultiplierMin: 0.05,
    fleeSizeMultiplierMax: 3,
    fleePredatorScaleOffset: 0.6,
    fleePredatorScaleRange: 0.6,
    fleeThreatProximityBase: 1,
    fleeThreatDistanceFloor: 1,
    fleeThreatProximityWeight: 1,
    fleeThreatAwarenessWeight: 1,
    fleeThreatCowardiceWeight: 1,
    fleeThreatScoreMax: 5,
    fleeCowardiceClampMax: 2,
    fleeSpeedFloor: 1,
    fleeTriggerAwarenessWeight: 1,
    fleeTriggerFearWeight: 1,
    fleeTriggerCourageWeight: 1,
    fleeTriggerNormalization: 3,
    fleeTriggerClampMin: 0.1,
    fleeTriggerClampMax: 2,
    fleeDangerTimerMin: 1.25,
    fleeDangerHoldIntensityOffset: 0.5,
    fleeDangerHoldIntensityMin: 0.5,
    fleeDangerHoldIntensityMax: 2,
    fleeDangerIntensityBase: 0.5,
    fleeDangerDecayStep: 0.05,
    fleeDangerDecayBase: 1,
    fleeDangerDecayAttentionOffset: 0.5,
    fleeDangerDecayAttentionScale: 0.6,
    fleeDangerDecayMin: 0.5,
    fleeDangerDecayMax: 1.5,
    fleeSpeedBoostBase: 1.2,
    fleeSpeedBoostStaminaScale: 0.2,
    reproductionMaturityAgeYears,
    fatCapacity,
    fatBurnThreshold: fatCapacity * 0.5,
    patrolThreshold: clamp(curiosity, 0, 1) * hungerThreshold,
    aggression,
    bravery: 0.5,
    power: 80,
    defence: 60,
    fightPersistence: clamp(aggression, 0.05, 1),
    escapeTendency: clamp(fear + 0.15, 0.05, 1),
    escapeDuration: 2,
    lingerRate: clamp(curiosity, 0.1, 1),
    dangerRadius: Math.max(120, vision * 0.5),
    attentionSpan: 0.5,
    libidoThreshold: Reproduction.libidoThreshold[entity] || 0.6,
    libidoGainRate: clamp((DNAComp.fertility[entity] ?? 0.3) * 0.4, 0.01, 0.2),
    libidoPressureBase: 0.8,
    libidoPressureStabilityWeight: 0.25,
    mateSearchLibidoRatioThreshold: 1,
    mateSearchTurnJitterScale: 2.75,
    mateSearchTurnChanceBase: 0.18,
    mateSearchTurnChanceCuriosityScale: 0.22,
    mateCooldownDuration: 5,
    mateCooldownScaleBase: 0.7,
    mateCooldownFertilityScale: 1,
    mateCooldownScaleMin: 0.6,
    mateCooldownScaleMax: 1.7,
    mateEnergyCostScale: 1.5,
    mateGestationBase: 6,
    mateGestationScale: 0.6,
    patrolHerdCohesionWeight: 0.6,
    patrolHerdDependencyWeight: 0.4,
    patrolSocialPressureBase: 1.05,
    patrolSocialPressureStabilityWeight: 0.1,
    patrolSocialThresholdBase: 0.52,
    patrolSocialThresholdStabilityWeight: 0.08,
    patrolSpeedMultiplier: 1.05,
    curiosityDriveBase: 0.7,
    curiosityDriveStabilityWeight: 0.4,
    exploreThreshold: 0.52,
    idleDriveBase: 0.6,
    idleDriveStabilityWeight: 0.6,
    idleThreshold: 0.55,
    mateRange: clamp(DNAComp.mateRange ? DNAComp.mateRange[entity] : vision * 0.25, 12, 120),
    mutationRate: DNAComp.mutationRate[entity] || 0.01,
    bodyMass,
    metabolism,
    turnRate: Heading.turnRate[entity] || 1,
    curiosity,
    cohesion: DNAComp.socialDrive[entity] ?? 0.3,
    fear,
    dependency: DNAComp.dependency ? DNAComp.dependency[entity] : 0.5,
    independenceAge: DNAComp.independenceAge ? DNAComp.independenceAge[entity] : 20,
    cowardice: DNAComp.cowardice ? DNAComp.cowardice[entity] : fear,
    camo: DNAComp.camo ? DNAComp.camo[entity] : 0.3,
    awareness: DNAComp.awareness ? DNAComp.awareness[entity] : clamp(vision / 360, 0.2, 1),
    fertility: DNAComp.fertility[entity] ?? 0.3,
    gestationCost: DNAComp.gestationCost
      ? DNAComp.gestationCost[entity]
      : clamp(metabolism * 1.5, 5, 40),
    moodStability: DNAComp.moodStability ? DNAComp.moodStability[entity] : 0.5,
    cannibalism: DNAComp.cannibalism ? DNAComp.cannibalism[entity] : 0,
    terrainPreference: DNAComp.terrainPreference ? DNAComp.terrainPreference[entity] : 0.5,
    preferredFood:
      archetype === 'hunter'
        ? ['prey', 'scavenger']
        : archetype === 'scavenger'
          ? []
          : ['plant'],
    stamina: DNAComp.stamina ? DNAComp.stamina[entity] : 1,
    circadianBias: DNAComp.circadianBias ? DNAComp.circadianBias[entity] : 0,
    sleepEfficiency: DNAComp.sleepEfficiency ? DNAComp.sleepEfficiency[entity] : 0.8,
    scavengerAffinity: DNAComp.scavengerAffinity ? DNAComp.scavengerAffinity[entity] : 0,
    senseUpkeep: DNAComp.senseUpkeep ? DNAComp.senseUpkeep[entity] : 0,
    speciesFear: DNAComp.speciesFear ? DNAComp.speciesFear[entity] : fear,
    conspecificFear: DNAComp.conspecificFear ? DNAComp.conspecificFear[entity] : 0.25,
    sizeFear: DNAComp.sizeFear ? DNAComp.sizeFear[entity] : 0.5,
    preySizeTargetRatio: archetype === 'hunter' ? 0.6 : 0.9,
    maturityAgeYears,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(archetype, 'land'),
  })
}

function mutateBodyPlanGenes(dna: DNA, ctx: SimulationContext) {
  const plan = dna.bodyPlan
  if (!plan) return
  const roll = ctx.rng()

  // ~30% of the time: mutate organ counts (adds/removes capabilities).
  if (roll < 0.3) {
    if (!plan.senses.length || ctx.rng() < 0.25) {
      plan.senses.push({ sense: 'eye', count: 1, distribution: 'head', acuity: 0.5 })
    } else {
      const sense = plan.senses[Math.floor(ctx.rng() * plan.senses.length)]!
      const step = ctx.rng() < 0.65 ? 2 : 1
      sense.count = clamp(Math.round(sense.count + (ctx.rng() < 0.5 ? -step : step)), 0, 8)
      sense.acuity = clamp(sense.acuity + (ctx.rng() - 0.5) * 0.2, 0.1, 1)
    }
    plan.senses = plan.senses.filter((sense) => sense.count > 0)
    return
  }

  // ~30%: mutate sense placement (directional organs evolve).
  if (roll < 0.6 && plan.senses.length) {
    const sense = plan.senses[Math.floor(ctx.rng() * plan.senses.length)]!
    if (!sense.layout) sense.layout = { placements: [] }
    const desired = Math.max(0, Math.floor(sense.count))
    while (sense.layout.placements.length < desired) {
      sense.layout.placements.push({ x: 0.35, y: 0, angle: 0 })
    }
    sense.layout.placements = sense.layout.placements.slice(0, desired).map((p) => clampPlacement(p))
    if (sense.layout.placements.length) {
      const idx = Math.floor(ctx.rng() * sense.layout.placements.length)
      sense.layout.placements[idx] = mutatePlacement(sense.layout.placements[idx]!, ctx.rng, 1)
    }
    return
  }

  if (dna.biome === 'land' && featureFlags.landBodyPlan) {
    // On land, alternate between legs and tails, including mount evolution.
    const mutateTail = ctx.rng() < 0.4
    if (mutateTail) {
      const tail = plan.appendages.find((appendage) => appendage.kind === 'tail')
      if (!tail) {
        plan.appendages.push({ kind: 'tail', count: 1, size: 0.55, split: 0 })
      } else if (tail.kind === 'tail') {
        const step = ctx.rng() < 0.65 ? 1 : 0
        tail.count = clamp(Math.round(tail.count + (ctx.rng() < 0.5 ? -step : step)), 0, 3)
        tail.size = clamp(tail.size + (ctx.rng() - 0.5) * 0.2, 0.1, 1.2)
        tail.split = clamp(tail.split + (ctx.rng() - 0.5) * 0.15, 0, 1)
        if (tail.layout?.mounts?.length) {
          const idx = Math.floor(ctx.rng() * tail.layout.mounts.length)
          tail.layout.mounts[idx] = mutatePlacement(tail.layout.mounts[idx]!, ctx.rng, 1)
        }
      }
      plan.appendages = plan.appendages.filter((appendage) =>
        appendage.kind === 'tail' ? appendage.count > 0 : true,
      )
    } else {
      let leg = plan.limbs.find((limb) => limb.kind === 'leg')
      if (!leg) {
        plan.limbs.push({ kind: 'leg', count: 2, size: 0.6, placement: 'mid', gaitStyle: 0.5 })
      } else if (leg.kind === 'leg') {
        const step = ctx.rng() < 0.65 ? 2 : 1
        leg.count = clamp(Math.round(leg.count + (ctx.rng() < 0.5 ? -step : step)), 0, 10)
        leg.size = clamp(leg.size + (ctx.rng() - 0.5) * 0.2, 0.2, 1)
        leg.gaitStyle = clamp(leg.gaitStyle + (ctx.rng() - 0.5) * 0.3, 0.1, 1)
        if (leg.layout?.mounts?.length) {
          mutateMounts(leg.layout.mounts, ctx.rng, 1)
        }
      }
      plan.limbs = plan.limbs.filter((limb) => limb.kind !== 'leg' || limb.count > 0)
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

export const __test__ = {
  mutateBodyPlanGenes,
}
