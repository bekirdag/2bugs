import { serialize, unserialize } from 'php-serialize'

import {
  DEFAULT_WORLD_CONFIG,
  SNAPSHOT_VERSION,
  type AgentMode,
  type AgentState,
  type Biome,
  type DNA,
  type SimulationSnapshot,
  type WorldConfig,
} from '@/types/sim'
import { clamp } from '@/utils/math'
import { BODY_PLAN_VERSION, createBaseBodyPlan, prepareDNA } from '@/ecs/bodyPlan'

type LegacyCreature = Record<string, unknown>

export function legacyPhpToSnapshot(raw: string, config?: WorldConfig): SimulationSnapshot {
  const parsed = unserialize(raw) as Record<string, LegacyCreature>
  const agents: AgentState[] = []

  Object.entries(parsed).forEach(([id, creature]) => {
    const agent = normalizeLegacyCreature(id, creature)
    if (agent) {
      agents.push(agent)
    }
  })

  return {
    version: SNAPSHOT_VERSION,
    config: config ? cloneConfig(config) : DEFAULT_WORLD_CONFIG,
    tick: 0,
    agents,
    plants: [],
    stats: {
      // Treat legacy imports as a starting population; natural births will accrue after load.
      totalBirths: 0,
      totalDeaths: 0,
      mutations: 0,
      averageFitness: 0,
    },
  }
}

export function snapshotToLegacyPhp(snapshot: SimulationSnapshot): string {
  const record: Record<string, LegacyCreature> = {}
  snapshot.agents.forEach((agent) => {
    if (agent.dna.archetype !== 'hunter' && agent.dna.archetype !== 'prey') return
    record[`agent${agent.id}`] = serializeAgent(agent)
  })
  return serialize(record, undefined, { encoding: 'utf-8' })
}

function normalizeLegacyCreature(id: string, creature: LegacyCreature): AgentState | null {
  const type = (creature.type as string)?.toLowerCase()
  if (type !== 'hunter' && type !== 'prey') return null
  const archetype = type as DNA['archetype']

  const speedGene = Number(creature.speed ?? 50)
  const visionGene = Number(creature.eyesightfactor ?? 30)
  const hunger = Number(creature.threshold ?? 60)
  const maxStorage = Number(creature.max_storage ?? 140)
  const escapeTimer = Number(creature.escape_time ?? 0)
  const dangerTimeShort = Number(creature.danger_time ?? escapeTimer)
  const fallbackDangerLong = dangerTimeShort > 0 ? dangerTimeShort * 2 : 2
  const dangerTimeLong = Number(creature.danger_time_long ?? fallbackDangerLong)
  const lingerGene = Number(creature.linger_rate ?? 50)
  const fightEnergyRate = Number(creature.fight_energy_rate ?? 50)
  const rawMutation = Number(creature.mutation_rate ?? NaN)
  const mutationRate =
    Number.isFinite(rawMutation) && rawMutation > 0
      ? clamp(rawMutation > 1 ? rawMutation / 100 : rawMutation, 0.0001, 0.2)
      : 0.01
  const color = (creature.color as string) ?? '#ffffff'
  const fillColor = (creature.fill as string) ?? color
  const className = (creature.class as string) ?? `org ${color}`
  const genderRaw = ((creature.gender as string) ?? '').toLowerCase()
  const gender = genderRaw === 'm' ? 'm' : 'f'
  const patrol = {
    x: Number(creature.patrolx ?? 0),
    y: Number(creature.patroly ?? 0),
    set: String(creature.patrolset ?? 'false') === 'true',
  }
  const body = {
    width: Number(creature.width ?? (type === 'hunter' ? 20 : 10)),
    height: Number(creature.height ?? (type === 'hunter' ? 20 : 10)),
    radius: Number(creature.r ?? 10),
  }
  const parseOr = (value: unknown, fallback: number) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
  }
  const maturityAgeYears = clamp(
    1 + (clamp(maxStorage / 100, 0.8, 20) * 0.7) + (type === 'hunter' ? 1.4 : 0),
    1,
    20,
  )
  const reproductionMaturityAgeYears = clamp(Math.min(6, maturityAgeYears * 0.5), 0.1, 6)

  const biome: Biome = 'land'
  const dna: DNA = {
    archetype,
    biome,
    familyColor: color,
    baseSpeed: mapRange(speedGene, 0, 100, 180, 420),
    visionRange: mapRange(visionGene, 0, 100, 140, 360),
    hungerThreshold: hunger,
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
    forageStartRatio: clamp(mapRange(hunger, 0, 100, 0.85, 0.55), 0.25, 0.95),
    eatingGreed: clamp(mapRange(speedGene, 0, 100, 0.35, 0.85), 0, 1),
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
    fatCapacity: maxStorage,
    fatBurnThreshold: clamp(Number(creature.store_using_threshold ?? maxStorage * 0.6), 0, maxStorage),
    patrolThreshold: Number(creature.patrol_threshold ?? hunger * 0.7),
    aggression: clamp(Number(creature.aggression ?? 50) / 100, 0, 1),
    bravery: clamp(Number(creature.power ?? 50) / 100, 0, 1),
    power: Number(creature.power ?? 50),
    defence: Number(creature.defence ?? 40),
    fightPersistence: clamp(Number(creature.fight_rate ?? 50) / 100, 0, 1),
    escapeTendency: clamp(Number(creature.escape_rate ?? 50) / 100, 0, 1),
    escapeDuration: Number(creature.escape_long ?? 2),
    lingerRate: clamp(Number(creature.linger_rate ?? 50) / 100, 0, 1),
    dangerRadius: Number(creature.danger_distance ?? 120),
    attentionSpan: clamp(dangerTimeLong / 20, 0.2, 1.5),
    libidoThreshold: clamp(Number(creature.sex_threshold ?? 60) / 120, 0.1, 1),
    libidoGainRate: clamp(Number(creature.sex_desire ?? 50) / 500, 0.01, 0.2),
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
    mateRange: clamp(mapRange(visionGene, 0, 100, 20, 70), 12, 120),
    mutationRate,
    bodyMass: clamp(maxStorage / 100, 0.8, 2),
    metabolism: mapRange(hunger, 0, 100, 4, 12),
    turnRate: clamp(1 + lingerGene / 80, 0.5, 4),
    curiosity: clamp(Number(creature.patrol_threshold ?? 50) / 100, 0.2, 1),
    cohesion: clamp(Number(creature.escape_rate ?? 50) / 120, 0.1, 1),
    fear: clamp(Number(creature.danger_distance ?? 40) / 160, 0.1, 1),
    cowardice: clamp(Number(creature.escape_rate ?? 50) / 100, 0.1, 1),
    camo: clamp(Number(creature.defence ?? 40) / 120, 0.05, 0.9),
    awareness: clamp(Number(creature.eyesightfactor ?? 50) / 100, 0.3, 1),
    fertility: clamp(Number(creature.sex_desire ?? 50) / 100, 0.2, 0.9),
    gestationCost: clamp(Number(creature.sex_threshold ?? 60), 5, 40),
    maturityAgeYears,
    reproductionMaturityAgeYears,
    moodStability: clamp(1 - fightEnergyRate / 130, 0.1, 1),
    cannibalism: 0,
    terrainPreference: 0.5,
    preferredFood: type === 'hunter' ? ['prey', 'scavenger'] : ['plant'],
    stamina: clamp(mapRange(speedGene, 0, 100, 0.6, 1.4), 0.4, 2),
    circadianBias: type === 'hunter' ? 0.4 : -0.3,
    sleepEfficiency: clamp(1 - Number(creature.stress ?? 20) / 120, 0.4, 1),
    scavengerAffinity: type === 'hunter' ? 0.4 : 0.15,
    senseUpkeep: 0,
    speciesFear: clamp(Number(creature.danger_distance ?? 40) / 200, 0.1, 1),
    conspecificFear: clamp(Number(creature.escape_rate ?? 50) / 200, 0.05, 0.8),
    sizeFear: clamp(Number(creature.escape_rate ?? 50) / 120, 0.1, 1),
    preySizeTargetRatio: type === 'hunter' ? 0.6 : 0.9,
    dependency: clamp(parseOr(creature.khudz, 0.5), 0, 1), // fallback key, default mid
    independenceAge: clamp(parseOr(creature.ageout, 20), 5, 60),
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(type, biome),
  }

  const preparedDNA = prepareDNA(dna)

  return {
    id: parseInt(id.replace(/\D+/g, ''), 10) || Math.floor(Math.random() * 100000),
    dna: preparedDNA,
    position: { x: Number(creature.x ?? 0), y: Number(creature.y ?? 0) },
    velocity: { x: 0, y: 0 },
    heading: 0,
    energy: Number(creature.energy ?? 60),
    fatStore: clamp(Number(creature.store ?? 0), 0, preparedDNA.fatCapacity),
    age: Number(creature.age ?? 0),
    mode: legacyMode(creature.mode as string),
    mood: {
      stress: clamp(Number(creature.stress ?? 20) / 100, 0, 1),
      focus: clamp(Number(creature.focus ?? 50) / 100, 0, 1),
      social: clamp(Number(creature.social ?? 50) / 100, 0, 1),
      fatigue: 0,
      kind: 'idle',
      tier: 'growth',
      intensity: 0,
    },
    target: null,
    escapeCooldown: escapeTimer,
    gestationTimer: 0,
    injuries: 0,
    libido: clamp(Number(creature.sex_desire ?? 0) / 100, 0, 1),
    sexCooldown: 0,
    legacy: {
      gender,
      fightEnergyRate,
      patrol,
      dangerTime: dangerTimeShort,
      dangerTimeLong,
      escapeTime: escapeTimer,
      body,
      className,
      fillColor,
    },
    mutationMask: 0,
  }
}

function serializeAgent(agent: AgentState): LegacyCreature {
  const { dna } = agent
  const legacy = agent.legacy
  const speedGene = Math.round(mapRange(dna.baseSpeed, 180, 420, 0, 100))
  const visionGene = Math.round(mapRange(dna.visionRange, 140, 360, 0, 100))
  const hungerThreshold = Math.max(0, Math.round(dna.hungerThreshold))
  const fatCapacity = Math.max(0, Math.round(dna.fatCapacity))
  const store = clamp(Math.round(agent.fatStore), 0, fatCapacity)
  const storeUsingThreshold = clamp(Math.round(dna.fatBurnThreshold), 0, fatCapacity)
  const aggression = Math.round(clamp(dna.aggression, 0, 1) * 100)
  const fightRate = Math.round(clamp(dna.fightPersistence, 0, 1) * 100)
  const escapeRate = Math.round(clamp(dna.escapeTendency, 0, 1) * 100)
  const lingerRate = Math.round(clamp(dna.lingerRate, 0, 1) * 100)
  const libidoThreshold = Math.round(clamp(dna.libidoThreshold, 0, 1) * 120)
  const libido = Math.round(clamp(agent.libido, 0, 1) * 100)
  const attentionSpan = clamp(dna.attentionSpan ?? 0.5, 0.1, 2)
  const dangerTimeLong = Math.max(1, Math.round(attentionSpan * 20))
  const escapeLong = Math.max(1, Math.round(dna.escapeDuration))
  const dangerDistance = Math.max(1, Math.round(dna.dangerRadius))
  const patrolThreshold = Math.max(0, Math.round(dna.patrolThreshold))
  const gender = legacy?.gender ?? (agent.id % 2 === 0 ? 'm' : 'f')
  const className = legacy?.className ?? `org ${dna.familyColor}`
  const fillColor = legacy?.fillColor ?? dna.familyColor
  const energy = Math.max(0, Math.round(agent.energy))
  const age = Math.max(0, Math.round(agent.age))
  const escapeTime = Math.max(0, Math.round(legacy?.escapeTime ?? agent.escapeCooldown))
  const fightEnergyRate = Math.round(
    legacy?.fightEnergyRate ?? clamp(dna.moodStability ?? dna.bravery ?? 0.5, 0, 1) * 100,
  )
  const dangerTime = legacy?.dangerTime ?? escapeTime
  const legacyDangerLong = legacy?.dangerTimeLong
  const body = legacy?.body
  const width = body?.width ?? (dna.archetype === 'hunter' ? 20 : 10)
  const height = body?.height ?? (dna.archetype === 'hunter' ? 20 : 10)
  const radius = body?.radius ?? (dna.archetype === 'hunter' ? 10 : 10)
  const patrol = legacy?.patrol ?? { x: 0, y: 0, set: false }
  const dangerTimeLongValue = legacyDangerLong ?? dangerTimeLong

  return {
    id: `${dna.archetype}${agent.id}`,
    x: agent.position.x,
    y: agent.position.y,
    width,
    height,
    r: radius,
    fill: fillColor,
    mode: exportLegacyMode(agent.mode),
    type: dna.archetype,
    color: dna.familyColor,
    class: className,
    family: dna.familyColor,
    energy,
    threshold: hungerThreshold,
    speed: speedGene,
    eyesightfactor: visionGene,
    sex_desire: libido,
    sex_threshold: libidoThreshold,
    store,
    store_using_threshold: storeUsingThreshold,
    max_storage: fatCapacity,
    patrol_threshold: patrolThreshold,
    danger_distance: dangerDistance,
    danger_time: dangerTime,
    danger_time_long: dangerTimeLongValue,
    linger_rate: lingerRate,
    power: Math.round(dna.power),
    defence: Math.round(dna.defence),
    fight_rate: fightRate,
    fight_energy_rate: fightEnergyRate,
    escape_rate: escapeRate,
    escape_long: escapeLong,
    escape_time: escapeTime,
    aggression,
    gender,
    age,
    patrolx: patrol.x,
    patroly: patrol.y,
    patrolset: patrol.set ? 'true' : 'false',
  }
}

function exportLegacyMode(mode: AgentMode): string {
  switch (mode) {
    case 'hunt':
    case 'graze':
      return 'hunt'
    case 'flee':
      return 'danger'
    case 'mate':
      return 'sex'
    case 'patrol':
      return 'patrol'
    case 'fight':
      return 'fight'
    default:
      return 'sleep'
  }
}

function legacyMode(mode?: string): AgentMode {
  switch (mode) {
    case 'danger':
      return 'flee'
    case 'hunt':
      return 'hunt'
    case 'patrol':
      return 'patrol'
    case 'sex':
      return 'mate'
    default:
      return 'patrol'
  }
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const clamped = clamp(value, inMin, inMax)
  const normalized = (clamped - inMin) / (inMax - inMin || 1)
  return outMin + normalized * (outMax - outMin)
}

function cloneConfig(config: WorldConfig): WorldConfig {
  return {
    ...config,
    bounds: { ...config.bounds },
  }
}
