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
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'terrainPreference',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateRange',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'foragePressureBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'foragePressureVolatility',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'greedForageThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'greedForageWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'greedForagePressureThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'foragePressureSoftGate',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'foragePressureExhaustionBuffer',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepPressureWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'exhaustionPressureBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'exhaustionPressureStability',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'forageIntensityThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepThresholdBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepThresholdStability',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'digestionThresholdBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'digestionThresholdStability',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'recoveryThresholdBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'recoveryThresholdStability',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'greedHungerOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'plantHungerBoostThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'plantHungerBoost',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'keepEatingMultiplier',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'reproductionMaturityAgeYears',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'libidoPressureBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'libidoPressureStabilityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'curiosityDriveBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'curiosityDriveStabilityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'exploreThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'idleDriveBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'idleDriveStabilityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'idleThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeBiteBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeBiteGreedScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeBiteMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeBiteMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeMinBiomass',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeRemoveBiomass',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeTargetMinBiomass',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeMoistureLoss',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeEnergyMultiplier',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeHungerBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeHungerCuriosityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeCuriosityForageThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeSearchRadiusBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeSearchRadiusCuriosityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeScoreBiomassWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeScoreNutrientWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeDistanceFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeHungerRatioThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeHungerRatioNoPreyThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeTargetWeightBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeTargetFatCapacityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'grazeTargetHungerBoostBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreyHungerRatioThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetDistanceFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetFocusBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetFocusScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetAggressionBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetAggressionScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetAwarenessBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntTargetAwarenessScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBandScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBandOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBandMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBandMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBiasBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBiasMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeBiasMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeOverageBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeOverageThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeOverageMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntPreySizeOverageMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntStickinessLingerBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntStickinessLingerScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntStickinessAttentionBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntStickinessAttentionScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionHungerRatioThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionNutrientsMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionDistanceFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionFocusBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionFocusScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionHungerBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionHungerScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionAffinityBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionAffinityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionNutrientBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionNutrientScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionNutrientNorm',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionNutrientClampMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCarrionPreferWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCorpseReachScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCorpseReachMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'huntCorpseReachMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightInitiativeAggressionWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightInitiativeSizeWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightInitiativeRandomWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightInitiativeBiasWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightExchangeCount',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightLeverageExponent',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightVariabilityBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightVariabilityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightBaseDamage',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fightDamageCap',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeBiteBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeBiteMassScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeBiteGreedBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeBiteMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeBiteMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'scavengeMinNutrients',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeFearBiasFearWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeFearBiasCowardiceWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalThreatBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalThreatFearScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalStabilityBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalStabilityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalStressWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalThresholdBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSurvivalThresholdStabilityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeFightDriveAggressionWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeFightDrivePersistenceWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeBraveFearOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeBraveThreatThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeRatioOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeDeltaMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeDeltaMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeMultiplierBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeMultiplierMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSizeMultiplierMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleePredatorScaleOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleePredatorScaleRange',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatProximityBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatDistanceFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatProximityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatAwarenessWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatCowardiceWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeThreatScoreMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeCowardiceClampMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSpeedFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerAwarenessWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerFearWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerCourageWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerNormalization',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerClampMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeTriggerClampMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerTimerMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerHoldIntensityOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerHoldIntensityMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerHoldIntensityMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerIntensityBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayStep',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayAttentionOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayAttentionScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeDangerDecayMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSpeedBoostBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeSpeedBoostStaminaScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeEscapeDurationMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeEscapeDurationMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeEscapeTendencyMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'fleeEscapeTendencyMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateSearchLibidoRatioThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateSearchTurnJitterScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateSearchTurnChanceBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateSearchTurnChanceCuriosityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateCooldownDuration',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateCooldownScaleBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateCooldownFertilityScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateCooldownScaleMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateCooldownScaleMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateEnergyCostScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateGestationBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'mateGestationScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolHerdCohesionWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolHerdDependencyWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolSocialPressureBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolSocialPressureStabilityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolSocialThresholdBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolSocialThresholdStabilityWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolSpeedMultiplier',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepDebtMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepDebtGainScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepDebtStaminaFloor',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepEfficiencyBaseline',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepEfficiencyFactorBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepEfficiencyEffectScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepEfficiencyFactorMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepEfficiencyFactorMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepPressureRecoveryWeight',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepRecoveryScaleSleep',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepRecoveryScaleRecover',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepFatigueRecoveryScaleSleep',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepFatigueRecoveryScaleRecover',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepFatigueGainScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepCircadianRestThreshold',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepCircadianStressScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepCircadianPushScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepStaminaFactorBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepStaminaFactorOffset',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepStaminaFactorScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepStaminaFactorMin',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepStaminaFactorMax',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'sleepCircadianPreferenceMidpoint',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'hungerRestMultiplier',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'hungerSurvivalBufferScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'growthReserveBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'growthReserveGreedScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'satiationBase',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'satiationGreedScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolThresholdMinScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'patrolThresholdMaxScale',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'initialEnergyBirthMultiplier',
  // NOTE: appended to preserve mutation-mask indices for existing genes.
  'initialEnergySeedMultiplier',
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
  terrainPreference: { min: 0, max: 1 },
  mateRange: { min: 12, max: 120 },
  foragePressureBase: { min: 0.4, max: 1.2 },
  foragePressureVolatility: { min: 0.1, max: 0.8 },
  greedForageThreshold: { min: 0.25, max: 0.85 },
  greedForageWeight: { min: 0, max: 1 },
  greedForagePressureThreshold: { min: 0.2, max: 0.9 },
  foragePressureSoftGate: { min: 0.3, max: 0.9 },
  foragePressureExhaustionBuffer: { min: 0, max: 0.35 },
  sleepPressureWeight: { min: 0.4, max: 1.2 },
  exhaustionPressureBase: { min: 0.9, max: 1.3 },
  exhaustionPressureStability: { min: 0, max: 0.2 },
  forageIntensityThreshold: { min: 0.6, max: 1 },
  sleepThresholdBase: { min: 0.35, max: 0.8 },
  sleepThresholdStability: { min: 0, max: 0.35 },
  digestionThresholdBase: { min: 0.35, max: 0.8 },
  digestionThresholdStability: { min: 0, max: 0.35 },
  recoveryThresholdBase: { min: 0.3, max: 0.75 },
  recoveryThresholdStability: { min: 0, max: 0.3 },
  greedHungerOffset: { min: 0, max: 0.6 },
  plantHungerBoostThreshold: { min: 0.3, max: 0.9 },
  plantHungerBoost: { min: 1, max: 1.8 },
  keepEatingMultiplier: { min: 0.9, max: 2 },
  reproductionMaturityAgeYears: { min: 0.1, max: 6 },
  libidoPressureBase: { min: 0.4, max: 1.8 },
  libidoPressureStabilityWeight: { min: 0, max: 1 },
  curiosityDriveBase: { min: 0.2, max: 1.8 },
  curiosityDriveStabilityWeight: { min: 0, max: 1.5 },
  exploreThreshold: { min: 0.15, max: 0.95 },
  idleDriveBase: { min: 0.2, max: 1.8 },
  idleDriveStabilityWeight: { min: 0, max: 1.5 },
  idleThreshold: { min: 0.15, max: 0.95 },
  grazeBiteBase: { min: 0.1, max: 1.4 },
  grazeBiteGreedScale: { min: 0.1, max: 2.5 },
  grazeBiteMin: { min: 0.05, max: 1 },
  grazeBiteMax: { min: 0.2, max: 3 },
  grazeMinBiomass: { min: 0, max: 0.2 },
  grazeRemoveBiomass: { min: 0, max: 0.4 },
  grazeTargetMinBiomass: { min: 0, max: 0.4 },
  grazeMoistureLoss: { min: 0, max: 1 },
  grazeEnergyMultiplier: { min: 20, max: 260 },
  grazeHungerBase: { min: 0.5, max: 1.6 },
  grazeHungerCuriosityScale: { min: 0, max: 1.5 },
  grazeCuriosityForageThreshold: { min: 0, max: 1 },
  grazeSearchRadiusBase: { min: 20, max: 200 },
  grazeSearchRadiusCuriosityScale: { min: 40, max: 360 },
  grazeScoreBiomassWeight: { min: 0.05, max: 2 },
  grazeScoreNutrientWeight: { min: 0.05, max: 2 },
  grazeDistanceFloor: { min: 0.1, max: 12 },
  grazeHungerRatioThreshold: { min: 0.4, max: 1.2 },
  grazeHungerRatioNoPreyThreshold: { min: 0.6, max: 1.4 },
  grazeTargetWeightBase: { min: 0.2, max: 3 },
  grazeTargetFatCapacityWeight: { min: 0.05, max: 0.6 },
  grazeTargetHungerBoostBase: { min: 0.6, max: 1.4 },
  huntPreyHungerRatioThreshold: { min: 0.6, max: 1.6 },
  huntTargetDistanceFloor: { min: 0.1, max: 8 },
  huntTargetFocusBase: { min: 0.2, max: 1.5 },
  huntTargetFocusScale: { min: 0, max: 1.2 },
  huntTargetAggressionBase: { min: 0.6, max: 1.6 },
  huntTargetAggressionScale: { min: 0, max: 1.2 },
  huntTargetAwarenessBase: { min: 0, max: 0.8 },
  huntTargetAwarenessScale: { min: 0.4, max: 1.6 },
  huntPreySizeBandScale: { min: 0.2, max: 1.6 },
  huntPreySizeBandOffset: { min: 0, max: 0.6 },
  huntPreySizeBandMin: { min: 0.05, max: 0.6 },
  huntPreySizeBandMax: { min: 0.5, max: 2.5 },
  huntPreySizeBiasBase: { min: 0.6, max: 1.4 },
  huntPreySizeBiasMin: { min: 0.02, max: 0.4 },
  huntPreySizeBiasMax: { min: 0.6, max: 1.8 },
  huntPreySizeOverageBase: { min: 0.6, max: 1.4 },
  huntPreySizeOverageThreshold: { min: 0.6, max: 1.4 },
  huntPreySizeOverageMin: { min: 0.02, max: 0.4 },
  huntPreySizeOverageMax: { min: 0.6, max: 1.4 },
  huntStickinessLingerBase: { min: 0.6, max: 1.4 },
  huntStickinessLingerScale: { min: 0, max: 1.6 },
  huntStickinessAttentionBase: { min: 0.6, max: 1.4 },
  huntStickinessAttentionScale: { min: 0, max: 1.2 },
  huntCarrionHungerRatioThreshold: { min: 0.4, max: 1.2 },
  huntCarrionNutrientsMin: { min: 0, max: 1 },
  huntCarrionDistanceFloor: { min: 0.1, max: 8 },
  huntCarrionFocusBase: { min: 0.3, max: 1.2 },
  huntCarrionFocusScale: { min: 0, max: 1.2 },
  huntCarrionHungerBase: { min: 0.4, max: 1.2 },
  huntCarrionHungerScale: { min: 0, max: 2 },
  huntCarrionAffinityBase: { min: 0.4, max: 1.2 },
  huntCarrionAffinityScale: { min: 0, max: 1.5 },
  huntCarrionNutrientBase: { min: 0.3, max: 1.3 },
  huntCarrionNutrientScale: { min: 0, max: 1.8 },
  huntCarrionNutrientNorm: { min: 80, max: 1200 },
  huntCarrionNutrientClampMax: { min: 0.4, max: 2.5 },
  huntCarrionPreferWeight: { min: 0.5, max: 1.2 },
  huntCorpseReachScale: { min: 0, max: 1 },
  huntCorpseReachMin: { min: 0, max: 40 },
  huntCorpseReachMax: { min: 20, max: 220 },
  fightInitiativeAggressionWeight: { min: 0, max: 1 },
  fightInitiativeSizeWeight: { min: 0, max: 1 },
  fightInitiativeRandomWeight: { min: 0, max: 0.8 },
  fightInitiativeBiasWeight: { min: 0, max: 1 },
  fightExchangeCount: { min: 1, max: 10 },
  fightLeverageExponent: { min: 1, max: 6 },
  fightVariabilityBase: { min: 0.5, max: 1.2 },
  fightVariabilityScale: { min: 0, max: 0.8 },
  fightBaseDamage: { min: 2, max: 40 },
  fightDamageCap: { min: 40, max: 400 },
  scavengeBiteBase: { min: 4, max: 30 },
  scavengeBiteMassScale: { min: 1, max: 12 },
  scavengeBiteGreedBase: { min: 0.2, max: 1.2 },
  scavengeBiteMin: { min: 2, max: 30 },
  scavengeBiteMax: { min: 40, max: 400 },
  scavengeMinNutrients: { min: 0, max: 1 },
  fleeFearBiasFearWeight: { min: 0, max: 1.2 },
  fleeFearBiasCowardiceWeight: { min: 0, max: 1.2 },
  fleeSurvivalThreatBase: { min: 0.2, max: 1.2 },
  fleeSurvivalThreatFearScale: { min: 0, max: 1.5 },
  fleeSurvivalStabilityBase: { min: 0.6, max: 1.6 },
  fleeSurvivalStabilityScale: { min: 0, max: 0.8 },
  fleeSurvivalStressWeight: { min: 0, max: 0.5 },
  fleeSurvivalThresholdBase: { min: 0.2, max: 0.8 },
  fleeSurvivalThresholdStabilityScale: { min: 0, max: 0.4 },
  fleeFightDriveAggressionWeight: { min: 0, max: 1.2 },
  fleeFightDrivePersistenceWeight: { min: 0, max: 1.2 },
  fleeBraveFearOffset: { min: 0, max: 0.6 },
  fleeBraveThreatThreshold: { min: 0, max: 1 },
  fleeEscapeDurationMin: { min: 0.1, max: 6 },
  fleeEscapeDurationMax: { min: 2, max: 20 },
  fleeEscapeTendencyMin: { min: 0, max: 1 },
  fleeEscapeTendencyMax: { min: 0.5, max: 3 },
  mateSearchLibidoRatioThreshold: { min: 0.5, max: 1.4 },
  mateSearchTurnJitterScale: { min: 1, max: 4 },
  mateSearchTurnChanceBase: { min: 0.02, max: 0.35 },
  mateSearchTurnChanceCuriosityScale: { min: 0, max: 0.8 },
  mateCooldownDuration: { min: 1, max: 12 },
  mateCooldownScaleBase: { min: 0.3, max: 1.4 },
  mateCooldownFertilityScale: { min: 0, max: 1.6 },
  mateCooldownScaleMin: { min: 0.2, max: 1 },
  mateCooldownScaleMax: { min: 1, max: 3 },
  mateEnergyCostScale: { min: 0.5, max: 3 },
  mateGestationBase: { min: 2, max: 12 },
  mateGestationScale: { min: 0.1, max: 1.5 },
  patrolHerdCohesionWeight: { min: 0, max: 1.2 },
  patrolHerdDependencyWeight: { min: 0, max: 1.2 },
  patrolSocialPressureBase: { min: 0.6, max: 1.6 },
  patrolSocialPressureStabilityWeight: { min: 0, max: 0.5 },
  patrolSocialThresholdBase: { min: 0.2, max: 0.9 },
  patrolSocialThresholdStabilityWeight: { min: 0, max: 0.4 },
  patrolSpeedMultiplier: { min: 0.6, max: 1.6 },
  sleepDebtMax: { min: 1, max: 12 },
  sleepDebtGainScale: { min: 0.2, max: 2 },
  sleepDebtStaminaFloor: { min: 0.2, max: 1.2 },
  sleepEfficiencyBaseline: { min: 0.5, max: 1 },
  sleepEfficiencyFactorBase: { min: 0.6, max: 1.6 },
  sleepEfficiencyEffectScale: { min: 0, max: 1 },
  sleepEfficiencyFactorMin: { min: 0.2, max: 1 },
  sleepEfficiencyFactorMax: { min: 1, max: 2 },
  sleepPressureRecoveryWeight: { min: 0, max: 1 },
  sleepRecoveryScaleSleep: { min: 0.4, max: 1.6 },
  sleepRecoveryScaleRecover: { min: 0.1, max: 1 },
  sleepFatigueRecoveryScaleSleep: { min: 0.1, max: 0.8 },
  sleepFatigueRecoveryScaleRecover: { min: 0.05, max: 0.6 },
  sleepFatigueGainScale: { min: 0.05, max: 0.5 },
  sleepCircadianRestThreshold: { min: 0.2, max: 0.6 },
  sleepCircadianStressScale: { min: 0, max: 0.6 },
  sleepCircadianPushScale: { min: 0, max: 1 },
  sleepStaminaFactorBase: { min: 0.8, max: 1.4 },
  sleepStaminaFactorOffset: { min: 0.6, max: 1.4 },
  sleepStaminaFactorScale: { min: 0.2, max: 1.2 },
  sleepStaminaFactorMin: { min: 0.2, max: 1.2 },
  sleepStaminaFactorMax: { min: 0.8, max: 2 },
  sleepCircadianPreferenceMidpoint: { min: 0.3, max: 0.7 },
  hungerRestMultiplier: { min: 1, max: 2.5 },
  hungerSurvivalBufferScale: { min: 0.02, max: 0.2 },
  growthReserveBase: { min: 0.6, max: 1.4 },
  growthReserveGreedScale: { min: 0, max: 1 },
  satiationBase: { min: 0.6, max: 1.4 },
  satiationGreedScale: { min: 0.5, max: 2 },
  patrolThresholdMinScale: { min: 0.1, max: 0.6 },
  patrolThresholdMaxScale: { min: 0.8, max: 2 },
  initialEnergyBirthMultiplier: { min: 1.5, max: 4 },
  initialEnergySeedMultiplier: { min: 2, max: 5 },
  fleeSizeRatioOffset: { min: 0.4, max: 1.4 },
  fleeSizeDeltaMin: { min: -1.5, max: 0 },
  fleeSizeDeltaMax: { min: 0.5, max: 5 },
  fleeSizeMultiplierBase: { min: 0.6, max: 1.6 },
  fleeSizeMultiplierMin: { min: 0.01, max: 0.6 },
  fleeSizeMultiplierMax: { min: 1, max: 4 },
  fleePredatorScaleOffset: { min: 0.2, max: 1.2 },
  fleePredatorScaleRange: { min: 0.2, max: 1.2 },
  fleeThreatProximityBase: { min: 0.4, max: 1.4 },
  fleeThreatDistanceFloor: { min: 0.2, max: 4 },
  fleeThreatProximityWeight: { min: 0, max: 2 },
  fleeThreatAwarenessWeight: { min: 0, max: 2 },
  fleeThreatCowardiceWeight: { min: 0, max: 2 },
  fleeThreatScoreMax: { min: 1, max: 8 },
  fleeCowardiceClampMax: { min: 0.5, max: 3 },
  fleeSpeedFloor: { min: 0.2, max: 6 },
  fleeTriggerAwarenessWeight: { min: 0, max: 2 },
  fleeTriggerFearWeight: { min: 0, max: 2 },
  fleeTriggerCourageWeight: { min: 0, max: 2 },
  fleeTriggerNormalization: { min: 1, max: 5 },
  fleeTriggerClampMin: { min: 0, max: 0.5 },
  fleeTriggerClampMax: { min: 1, max: 3 },
  fleeDangerTimerMin: { min: 0, max: 4 },
  fleeDangerHoldIntensityOffset: { min: 0, max: 1 },
  fleeDangerHoldIntensityMin: { min: 0, max: 1 },
  fleeDangerHoldIntensityMax: { min: 1, max: 3 },
  fleeDangerIntensityBase: { min: 0, max: 1.5 },
  fleeDangerDecayStep: { min: 0.001, max: 0.2 },
  fleeDangerDecayBase: { min: 0.4, max: 1.6 },
  fleeDangerDecayAttentionOffset: { min: 0, max: 1 },
  fleeDangerDecayAttentionScale: { min: 0, max: 1.2 },
  fleeDangerDecayMin: { min: 0.1, max: 1 },
  fleeDangerDecayMax: { min: 0.6, max: 2.5 },
  fleeSpeedBoostBase: { min: 0.6, max: 2 },
  fleeSpeedBoostStaminaScale: { min: 0, max: 0.8 },
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
    case 'reproductionMaturityAgeYears':
      return 0.1 + rng() * 5.9 // 0.1..6
    case 'libidoPressureBase':
      return 0.7 + rng() * 0.8 // 0.7..1.5
    case 'libidoPressureStabilityWeight':
      return rng() * 0.8 // 0..0.8
    case 'curiosityDriveBase':
      return 0.5 + rng() * 0.9 // 0.5..1.4
    case 'curiosityDriveStabilityWeight':
      return rng() * 0.9 // 0..0.9
    case 'exploreThreshold':
      return 0.35 + rng() * 0.5 // 0.35..0.85
    case 'idleDriveBase':
      return 0.45 + rng() * 0.9 // 0.45..1.35
    case 'idleDriveStabilityWeight':
      return rng() * 0.9 // 0..0.9
    case 'idleThreshold':
      return 0.35 + rng() * 0.5 // 0.35..0.85
    case 'grazeBiteBase':
      return 0.25 + rng() * 0.4 // 0.25..0.65
    case 'grazeBiteGreedScale':
      return 0.6 + rng() * 1.2 // 0.6..1.8
    case 'grazeBiteMin':
      return 0.15 + rng() * 0.25 // 0.15..0.4
    case 'grazeBiteMax':
      return 1 + rng() * 0.8 // 1..1.8
    case 'grazeMinBiomass':
      return rng() * 0.05 // 0..0.05
    case 'grazeRemoveBiomass':
      return 0.08 + rng() * 0.16 // 0.08..0.24
    case 'grazeTargetMinBiomass':
      return 0.08 + rng() * 0.18 // 0.08..0.26
    case 'grazeMoistureLoss':
      return 0.2 + rng() * 0.3 // 0.2..0.5
    case 'grazeEnergyMultiplier':
      return 80 + rng() * 100 // 80..180
    case 'grazeHungerBase':
      return 0.9 + rng() * 0.4 // 0.9..1.3
    case 'grazeHungerCuriosityScale':
      return 0.2 + rng() * 0.6 // 0.2..0.8
    case 'grazeCuriosityForageThreshold':
      return 0.35 + rng() * 0.5 // 0.35..0.85
    case 'grazeSearchRadiusBase':
      return 60 + rng() * 60 // 60..120
    case 'grazeSearchRadiusCuriosityScale':
      return 140 + rng() * 180 // 140..320
    case 'grazeScoreBiomassWeight':
      return 0.5 + rng() * 0.6 // 0.5..1.1
    case 'grazeScoreNutrientWeight':
      return 0.2 + rng() * 0.5 // 0.2..0.7
    case 'grazeDistanceFloor':
      return 0.6 + rng() * 1.2 // 0.6..1.8
    case 'grazeHungerRatioThreshold':
      return 0.75 + rng() * 0.35 // 0.75..1.1
    case 'grazeHungerRatioNoPreyThreshold':
      return 0.9 + rng() * 0.35 // 0.9..1.25
    case 'grazeTargetWeightBase':
      return 0.8 + rng() * 0.8 // 0.8..1.6
    case 'grazeTargetFatCapacityWeight':
      return 0.15 + rng() * 0.25 // 0.15..0.4
    case 'grazeTargetHungerBoostBase':
      return 0.85 + rng() * 0.3 // 0.85..1.15
    case 'huntPreyHungerRatioThreshold':
      return 0.85 + rng() * 0.4 // 0.85..1.25
    case 'huntTargetDistanceFloor':
      return 0.6 + rng() * 1.2 // 0.6..1.8
    case 'huntTargetFocusBase':
      return 0.5 + rng() * 0.3 // 0.5..0.8
    case 'huntTargetFocusScale':
      return 0.2 + rng() * 0.4 // 0.2..0.6
    case 'huntTargetAggressionBase':
      return 0.9 + rng() * 0.4 // 0.9..1.3
    case 'huntTargetAggressionScale':
      return 0.2 + rng() * 0.4 // 0.2..0.6
    case 'huntTargetAwarenessBase':
      return rng() * 0.2 // 0..0.2
    case 'huntTargetAwarenessScale':
      return 0.8 + rng() * 0.4 // 0.8..1.2
    case 'huntPreySizeBandScale':
      return 0.6 + rng() * 0.5 // 0.6..1.1
    case 'huntPreySizeBandOffset':
      return 0.05 + rng() * 0.2 // 0.05..0.25
    case 'huntPreySizeBandMin':
      return 0.12 + rng() * 0.2 // 0.12..0.32
    case 'huntPreySizeBandMax':
      return 1.1 + rng() * 0.5 // 1.1..1.6
    case 'huntPreySizeBiasBase':
      return 0.9 + rng() * 0.3 // 0.9..1.2
    case 'huntPreySizeBiasMin':
      return 0.03 + rng() * 0.05 // 0.03..0.08
    case 'huntPreySizeBiasMax':
      return 1.0 + rng() * 0.3 // 1.0..1.3
    case 'huntPreySizeOverageBase':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'huntPreySizeOverageThreshold':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'huntPreySizeOverageMin':
      return 0.03 + rng() * 0.05 // 0.03..0.08
    case 'huntPreySizeOverageMax':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'huntStickinessLingerBase':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'huntStickinessLingerScale':
      return 0.5 + rng() * 0.5 // 0.5..1.0
    case 'huntStickinessAttentionBase':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'huntStickinessAttentionScale':
      return 0.3 + rng() * 0.4 // 0.3..0.7
    case 'huntCarrionHungerRatioThreshold':
      return 0.7 + rng() * 0.3 // 0.7..1.0
    case 'huntCarrionNutrientsMin':
      return rng() * 0.2 // 0..0.2
    case 'huntCarrionDistanceFloor':
      return 0.6 + rng() * 1.2 // 0.6..1.8
    case 'huntCarrionFocusBase':
      return 0.5 + rng() * 0.3 // 0.5..0.8
    case 'huntCarrionFocusScale':
      return 0.2 + rng() * 0.3 // 0.2..0.5
    case 'huntCarrionHungerBase':
      return 0.7 + rng() * 0.3 // 0.7..1.0
    case 'huntCarrionHungerScale':
      return 0.8 + rng() * 0.9 // 0.8..1.7
    case 'huntCarrionAffinityBase':
      return 0.7 + rng() * 0.3 // 0.7..1.0
    case 'huntCarrionAffinityScale':
      return 0.4 + rng() * 0.5 // 0.4..0.9
    case 'huntCarrionNutrientBase':
      return 0.6 + rng() * 0.4 // 0.6..1.0
    case 'huntCarrionNutrientScale':
      return 0.6 + rng() * 0.7 // 0.6..1.3
    case 'huntCarrionNutrientNorm':
      return 260 + rng() * 320 // 260..580
    case 'huntCarrionNutrientClampMax':
      return 1 + rng() * 0.7 // 1..1.7
    case 'huntCarrionPreferWeight':
      return 0.75 + rng() * 0.3 // 0.75..1.05
    case 'huntCorpseReachScale':
      return 0.25 + rng() * 0.3 // 0.25..0.55
    case 'huntCorpseReachMin':
      return rng() * 10 // 0..10
    case 'huntCorpseReachMax':
      return 80 + rng() * 80 // 80..160
    case 'fightInitiativeAggressionWeight':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'fightInitiativeSizeWeight':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'fightInitiativeRandomWeight':
      return 0.15 + rng() * 0.2 // 0.15..0.35
    case 'fightInitiativeBiasWeight':
      return 0.3 + rng() * 0.4 // 0.3..0.7
    case 'fightExchangeCount':
      return 3 + rng() * 3 // 3..6
    case 'fightLeverageExponent':
      return 3 + rng() * 2 // 3..5
    case 'fightVariabilityBase':
      return 0.75 + rng() * 0.2 // 0.75..0.95
    case 'fightVariabilityScale':
      return 0.2 + rng() * 0.3 // 0.2..0.5
    case 'fightBaseDamage':
      return 8 + rng() * 8 // 8..16
    case 'fightDamageCap':
      return 160 + rng() * 120 // 160..280
    case 'scavengeBiteBase':
      return 10 + rng() * 8 // 10..18
    case 'scavengeBiteMassScale':
      return 4 + rng() * 4 // 4..8
    case 'scavengeBiteGreedBase':
      return 0.45 + rng() * 0.2 // 0.45..0.65
    case 'scavengeBiteMin':
      return 6 + rng() * 6 // 6..12
    case 'scavengeBiteMax':
      return 140 + rng() * 140 // 140..280
    case 'scavengeMinNutrients':
      return rng() * 0.2 // 0..0.2
    case 'fleeFearBiasFearWeight':
      return 0.5 + rng() * 0.4 // 0.5..0.9
    case 'fleeFearBiasCowardiceWeight':
      return 0.3 + rng() * 0.4 // 0.3..0.7
    case 'fleeSurvivalThreatBase':
      return 0.5 + rng() * 0.4 // 0.5..0.9
    case 'fleeSurvivalThreatFearScale':
      return 0.4 + rng() * 0.6 // 0.4..1
    case 'fleeSurvivalStabilityBase':
      return 0.9 + rng() * 0.3 // 0.9..1.2
    case 'fleeSurvivalStabilityScale':
      return 0.1 + rng() * 0.25 // 0.1..0.35
    case 'fleeSurvivalStressWeight':
      return rng() * 0.25 // 0..0.25
    case 'fleeSurvivalThresholdBase':
      return 0.35 + rng() * 0.2 // 0.35..0.55
    case 'fleeSurvivalThresholdStabilityScale':
      return 0.05 + rng() * 0.15 // 0.05..0.2
    case 'fleeFightDriveAggressionWeight':
      return 0.5 + rng() * 0.4 // 0.5..0.9
    case 'fleeFightDrivePersistenceWeight':
      return 0.2 + rng() * 0.4 // 0.2..0.6
    case 'fleeBraveFearOffset':
      return 0.1 + rng() * 0.15 // 0.1..0.25
    case 'fleeBraveThreatThreshold':
      return 0.35 + rng() * 0.2 // 0.35..0.55
    case 'fleeEscapeDurationMin':
      return 0.4 + rng() * 0.8 // 0.4..1.2
    case 'fleeEscapeDurationMax':
      return 8 + rng() * 6 // 8..14
    case 'fleeEscapeTendencyMin':
      return 0.01 + rng() * 0.07 // 0.01..0.08
    case 'fleeEscapeTendencyMax':
      return 1.4 + rng() * 1 // 1.4..2.4
    case 'fleeSizeRatioOffset':
      return 0.8 + rng() * 0.4 // 0.8..1.2
    case 'fleeSizeDeltaMin':
      return -1 + rng() * 0.4 // -1..-0.6
    case 'fleeSizeDeltaMax':
      return 2 + rng() * 1.5 // 2..3.5
    case 'fleeSizeMultiplierBase':
      return 0.9 + rng() * 0.4 // 0.9..1.3
    case 'fleeSizeMultiplierMin':
      return 0.03 + rng() * 0.08 // 0.03..0.11
    case 'fleeSizeMultiplierMax':
      return 2.2 + rng() * 1.2 // 2.2..3.4
    case 'fleePredatorScaleOffset':
      return 0.5 + rng() * 0.2 // 0.5..0.7
    case 'fleePredatorScaleRange':
      return 0.5 + rng() * 0.2 // 0.5..0.7
    case 'fleeThreatProximityBase':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'fleeThreatDistanceFloor':
      return 0.6 + rng() * 0.6 // 0.6..1.2
    case 'fleeThreatProximityWeight':
      return 0.8 + rng() * 0.6 // 0.8..1.4
    case 'fleeThreatAwarenessWeight':
      return 0.8 + rng() * 0.6 // 0.8..1.4
    case 'fleeThreatCowardiceWeight':
      return 0.8 + rng() * 0.6 // 0.8..1.4
    case 'fleeThreatScoreMax':
      return 4 + rng() * 2.5 // 4..6.5
    case 'fleeCowardiceClampMax':
      return 1.4 + rng() * 0.8 // 1.4..2.2
    case 'fleeSpeedFloor':
      return 0.6 + rng() * 0.6 // 0.6..1.2
    case 'fleeTriggerAwarenessWeight':
      return 0.8 + rng() * 0.5 // 0.8..1.3
    case 'fleeTriggerFearWeight':
      return 0.8 + rng() * 0.5 // 0.8..1.3
    case 'fleeTriggerCourageWeight':
      return 0.8 + rng() * 0.5 // 0.8..1.3
    case 'fleeTriggerNormalization':
      return 2.4 + rng() * 1 // 2.4..3.4
    case 'fleeTriggerClampMin':
      return 0.05 + rng() * 0.1 // 0.05..0.15
    case 'fleeTriggerClampMax':
      return 1.4 + rng() * 0.8 // 1.4..2.2
    case 'fleeDangerTimerMin':
      return 0.9 + rng() * 0.8 // 0.9..1.7
    case 'fleeDangerHoldIntensityOffset':
      return 0.35 + rng() * 0.3 // 0.35..0.65
    case 'fleeDangerHoldIntensityMin':
      return 0.35 + rng() * 0.3 // 0.35..0.65
    case 'fleeDangerHoldIntensityMax':
      return 1.6 + rng() * 0.8 // 1.6..2.4
    case 'fleeDangerIntensityBase':
      return 0.35 + rng() * 0.3 // 0.35..0.65
    case 'fleeDangerDecayStep':
      return 0.03 + rng() * 0.04 // 0.03..0.07
    case 'fleeDangerDecayBase':
      return 0.9 + rng() * 0.3 // 0.9..1.2
    case 'fleeDangerDecayAttentionOffset':
      return 0.35 + rng() * 0.3 // 0.35..0.65
    case 'fleeDangerDecayAttentionScale':
      return 0.4 + rng() * 0.4 // 0.4..0.8
    case 'fleeDangerDecayMin':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'fleeDangerDecayMax':
      return 1.2 + rng() * 0.6 // 1.2..1.8
    case 'fleeSpeedBoostBase':
      return 1 + rng() * 0.5 // 1..1.5
    case 'fleeSpeedBoostStaminaScale':
      return 0.1 + rng() * 0.2 // 0.1..0.3
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
    case 'terrainPreference':
      return rng()
    case 'mateRange':
      return 20 + rng() * 60
    case 'mateSearchLibidoRatioThreshold':
      return 0.8 + rng() * 0.35 // 0.8..1.15
    case 'mateSearchTurnJitterScale':
      return 1.6 + rng() * 1.6 // 1.6..3.2
    case 'mateSearchTurnChanceBase':
      return 0.08 + rng() * 0.14 // 0.08..0.22
    case 'mateSearchTurnChanceCuriosityScale':
      return 0.1 + rng() * 0.3 // 0.1..0.4
    case 'mateCooldownDuration':
      return 3 + rng() * 4 // 3..7
    case 'mateCooldownScaleBase':
      return 0.6 + rng() * 0.6 // 0.6..1.2
    case 'mateCooldownFertilityScale':
      return 0.3 + rng() * 0.6 // 0.3..0.9
    case 'mateCooldownScaleMin':
      return 0.5 + rng() * 0.3 // 0.5..0.8
    case 'mateCooldownScaleMax':
      return 1.4 + rng() * 0.8 // 1.4..2.2
    case 'mateEnergyCostScale':
      return 1.1 + rng() * 0.6 // 1.1..1.7
    case 'mateGestationBase':
      return 4 + rng() * 4 // 4..8
    case 'mateGestationScale':
      return 0.4 + rng() * 0.4 // 0.4..0.8
    case 'patrolHerdCohesionWeight':
      return 0.4 + rng() * 0.4 // 0.4..0.8
    case 'patrolHerdDependencyWeight':
      return 0.2 + rng() * 0.6 // 0.2..0.8
    case 'patrolSocialPressureBase':
      return 0.9 + rng() * 0.4 // 0.9..1.3
    case 'patrolSocialPressureStabilityWeight':
      return 0.05 + rng() * 0.15 // 0.05..0.2
    case 'patrolSocialThresholdBase':
      return 0.4 + rng() * 0.2 // 0.4..0.6
    case 'patrolSocialThresholdStabilityWeight':
      return 0.04 + rng() * 0.08 // 0.04..0.12
    case 'patrolSpeedMultiplier':
      return 0.9 + rng() * 0.3 // 0.9..1.2
    case 'sleepDebtMax':
      return 4 + rng() * 3 // 4..7
    case 'sleepDebtGainScale':
      return 0.6 + rng() * 0.6 // 0.6..1.2
    case 'sleepDebtStaminaFloor':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'sleepEfficiencyBaseline':
      return 0.7 + rng() * 0.2 // 0.7..0.9
    case 'sleepEfficiencyFactorBase':
      return 1.0 + rng() * 0.3 // 1.0..1.3
    case 'sleepEfficiencyEffectScale':
      return 0.3 + rng() * 0.4 // 0.3..0.7
    case 'sleepEfficiencyFactorMin':
      return 0.5 + rng() * 0.2 // 0.5..0.7
    case 'sleepEfficiencyFactorMax':
      return 1.2 + rng() * 0.4 // 1.2..1.6
    case 'sleepPressureRecoveryWeight':
      return 0.2 + rng() * 0.3 // 0.2..0.5
    case 'sleepRecoveryScaleSleep':
      return 0.8 + rng() * 0.4 // 0.8..1.2
    case 'sleepRecoveryScaleRecover':
      return 0.3 + rng() * 0.3 // 0.3..0.6
    case 'sleepFatigueRecoveryScaleSleep':
      return 0.3 + rng() * 0.2 // 0.3..0.5
    case 'sleepFatigueRecoveryScaleRecover':
      return 0.15 + rng() * 0.2 // 0.15..0.35
    case 'sleepFatigueGainScale':
      return 0.15 + rng() * 0.2 // 0.15..0.35
    case 'sleepCircadianRestThreshold':
      return 0.3 + rng() * 0.1 // 0.3..0.4
    case 'sleepCircadianStressScale':
      return 0.15 + rng() * 0.2 // 0.15..0.35
    case 'sleepCircadianPushScale':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'sleepStaminaFactorBase':
      return 1.05 + rng() * 0.25 // 1.05..1.3
    case 'sleepStaminaFactorOffset':
      return 0.9 + rng() * 0.2 // 0.9..1.1
    case 'sleepStaminaFactorScale':
      return 0.4 + rng() * 0.4 // 0.4..0.8
    case 'sleepStaminaFactorMin':
      return 0.4 + rng() * 0.3 // 0.4..0.7
    case 'sleepStaminaFactorMax':
      return 1.3 + rng() * 0.4 // 1.3..1.7
    case 'sleepCircadianPreferenceMidpoint':
      return 0.45 + rng() * 0.1 // 0.45..0.55
    case 'hungerRestMultiplier':
      return 1.3 + rng() * 0.4 // 1.3..1.7
    case 'hungerSurvivalBufferScale':
      return 0.05 + rng() * 0.08 // 0.05..0.13
    case 'growthReserveBase':
      return 0.85 + rng() * 0.2 // 0.85..1.05
    case 'growthReserveGreedScale':
      return 0.25 + rng() * 0.35 // 0.25..0.6
    case 'satiationBase':
      return 0.85 + rng() * 0.3 // 0.85..1.15
    case 'satiationGreedScale':
      return 1 + rng() * 0.6 // 1.0..1.6
    case 'patrolThresholdMinScale':
      return 0.15 + rng() * 0.15 // 0.15..0.3
    case 'patrolThresholdMaxScale':
      return 1 + rng() * 0.4 // 1.0..1.4
    case 'initialEnergyBirthMultiplier':
      return 2.2 + rng() * 0.6 // 2.2..2.8
    case 'initialEnergySeedMultiplier':
      return 2.8 + rng() * 0.6 // 2.8..3.4
    case 'foragePressureBase':
      return 0.6 + rng() * 0.4
    case 'foragePressureVolatility':
      return 0.2 + rng() * 0.4
    case 'greedForageThreshold':
      return 0.45 + rng() * 0.25
    case 'greedForageWeight':
      return 0.3 + rng() * 0.4
    case 'greedForagePressureThreshold':
      return 0.4 + rng() * 0.3
    case 'foragePressureSoftGate':
      return 0.5 + rng() * 0.25
    case 'foragePressureExhaustionBuffer':
      return 0.05 + rng() * 0.12
    case 'sleepPressureWeight':
      return 0.7 + rng() * 0.35
    case 'exhaustionPressureBase':
      return 1 + rng() * 0.15
    case 'exhaustionPressureStability':
      return 0.03 + rng() * 0.08
    case 'forageIntensityThreshold':
      return 0.7 + rng() * 0.25
    case 'sleepThresholdBase':
      return 0.45 + rng() * 0.2
    case 'sleepThresholdStability':
      return 0.05 + rng() * 0.12
    case 'digestionThresholdBase':
      return 0.45 + rng() * 0.2
    case 'digestionThresholdStability':
      return 0.05 + rng() * 0.12
    case 'recoveryThresholdBase':
      return 0.42 + rng() * 0.18
    case 'recoveryThresholdStability':
      return 0.04 + rng() * 0.12
    case 'greedHungerOffset':
      return 0.2 + rng() * 0.3
    case 'plantHungerBoostThreshold':
      return 0.45 + rng() * 0.25
    case 'plantHungerBoost':
      return 1.05 + rng() * 0.35
    case 'keepEatingMultiplier':
      return 1.05 + rng() * 0.35
    default:
      return rng()
  }
}
