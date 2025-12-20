export type Archetype = 'hunter' | 'prey' | 'plant' | 'scavenger'
export type Biome = 'land' | 'water' | 'air'

export interface Vector2 {
  x: number
  y: number
}

export const SNAPSHOT_VERSION = 1

export interface DNA {
  archetype: Archetype
  biome: Biome
  familyColor: string
  baseSpeed: number
  visionRange: number
  hungerThreshold: number
  hungerRestMultiplier: number
  hungerSurvivalBufferScale: number
  growthReserveBase: number
  growthReserveGreedScale: number
  satiationBase: number
  satiationGreedScale: number
  patrolThresholdMinScale: number
  patrolThresholdMaxScale: number
  initialEnergyBirthMultiplier: number
  initialEnergySeedMultiplier: number
  // When `Energy.value / hungerLine` drops below this ratio, the agent begins actively searching for food.
  // Higher values => starts foraging earlier (more proactive); lower values => waits longer (more risk).
  forageStartRatio: number
  // Desired "fullness" / appetite. Higher values => eats larger bites and keeps eating past satiation,
  // turning more intake into stored fat.
  eatingGreed: number
  foragePressureBase: number
  foragePressureVolatility: number
  greedForageThreshold: number
  greedForageWeight: number
  greedForagePressureThreshold: number
  foragePressureSoftGate: number
  foragePressureExhaustionBuffer: number
  sleepPressureWeight: number
  exhaustionPressureBase: number
  exhaustionPressureStability: number
  forageIntensityThreshold: number
  sleepThresholdBase: number
  sleepThresholdStability: number
  // Sleep pressure/efficiency tuning.
  sleepDebtMax: number
  sleepDebtGainScale: number
  sleepDebtStaminaFloor: number
  sleepEfficiencyBaseline: number
  sleepEfficiencyFactorBase: number
  sleepEfficiencyEffectScale: number
  sleepEfficiencyFactorMin: number
  sleepEfficiencyFactorMax: number
  sleepPressureRecoveryWeight: number
  sleepRecoveryScaleSleep: number
  sleepRecoveryScaleRecover: number
  sleepFatigueRecoveryScaleSleep: number
  sleepFatigueRecoveryScaleRecover: number
  sleepFatigueGainScale: number
  sleepStaminaFactorBase: number
  sleepStaminaFactorOffset: number
  sleepStaminaFactorScale: number
  sleepStaminaFactorMin: number
  sleepStaminaFactorMax: number
  sleepCircadianRestThreshold: number
  sleepCircadianStressScale: number
  sleepCircadianPushScale: number
  sleepCircadianPreferenceMidpoint: number
  digestionThresholdBase: number
  digestionThresholdStability: number
  recoveryThresholdBase: number
  recoveryThresholdStability: number
  greedHungerOffset: number
  plantHungerBoostThreshold: number
  plantHungerBoost: number
  keepEatingMultiplier: number
  grazeBiteBase: number
  grazeBiteGreedScale: number
  grazeBiteMin: number
  grazeBiteMax: number
  grazeMinBiomass: number
  grazeRemoveBiomass: number
  grazeTargetMinBiomass: number
  grazeMoistureLoss: number
  grazeEnergyMultiplier: number
  grazeHungerBase: number
  grazeHungerCuriosityScale: number
  grazeCuriosityForageThreshold: number
  grazeSearchRadiusBase: number
  grazeSearchRadiusCuriosityScale: number
  grazeScoreBiomassWeight: number
  grazeScoreNutrientWeight: number
  grazeDistanceFloor: number
  grazeHungerRatioThreshold: number
  grazeHungerRatioNoPreyThreshold: number
  grazeTargetWeightBase: number
  grazeTargetFatCapacityWeight: number
  grazeTargetHungerBoostBase: number
  huntPreyHungerRatioThreshold: number
  huntTargetDistanceFloor: number
  huntTargetFocusBase: number
  huntTargetFocusScale: number
  huntTargetAggressionBase: number
  huntTargetAggressionScale: number
  huntTargetAwarenessBase: number
  huntTargetAwarenessScale: number
  huntPreySizeBandScale: number
  huntPreySizeBandOffset: number
  huntPreySizeBandMin: number
  huntPreySizeBandMax: number
  huntPreySizeBiasBase: number
  huntPreySizeBiasMin: number
  huntPreySizeBiasMax: number
  huntPreySizeOverageBase: number
  huntPreySizeOverageThreshold: number
  huntPreySizeOverageMin: number
  huntPreySizeOverageMax: number
  huntStickinessLingerBase: number
  huntStickinessLingerScale: number
  huntStickinessAttentionBase: number
  huntStickinessAttentionScale: number
  huntCarrionHungerRatioThreshold: number
  huntCarrionNutrientsMin: number
  huntCarrionDistanceFloor: number
  huntCarrionFocusBase: number
  huntCarrionFocusScale: number
  huntCarrionHungerBase: number
  huntCarrionHungerScale: number
  huntCarrionAffinityBase: number
  huntCarrionAffinityScale: number
  huntCarrionNutrientBase: number
  huntCarrionNutrientScale: number
  huntCarrionNutrientNorm: number
  huntCarrionNutrientClampMax: number
  huntCarrionPreferWeight: number
  huntCorpseReachScale: number
  huntCorpseReachMin: number
  huntCorpseReachMax: number
  fightInitiativeAggressionWeight: number
  fightInitiativeSizeWeight: number
  fightInitiativeRandomWeight: number
  fightInitiativeBiasWeight: number
  fightExchangeCount: number
  fightLeverageExponent: number
  fightVariabilityBase: number
  fightVariabilityScale: number
  fightBaseDamage: number
  fightDamageCap: number
  scavengeBiteBase: number
  scavengeBiteMassScale: number
  scavengeBiteGreedBase: number
  scavengeBiteMin: number
  scavengeBiteMax: number
  scavengeMinNutrients: number
  fleeFearBiasFearWeight: number
  fleeFearBiasCowardiceWeight: number
  fleeSurvivalThreatBase: number
  fleeSurvivalThreatFearScale: number
  fleeSurvivalStabilityBase: number
  fleeSurvivalStabilityScale: number
  fleeSurvivalStressWeight: number
  fleeSurvivalThresholdBase: number
  fleeSurvivalThresholdStabilityScale: number
  fleeFightDriveAggressionWeight: number
  fleeFightDrivePersistenceWeight: number
  fleeBraveFearOffset: number
  fleeBraveThreatThreshold: number
  fleeEscapeDurationMin: number
  fleeEscapeDurationMax: number
  fleeEscapeTendencyMin: number
  fleeEscapeTendencyMax: number
  fleeSizeRatioOffset: number
  fleeSizeDeltaMin: number
  fleeSizeDeltaMax: number
  fleeSizeMultiplierBase: number
  fleeSizeMultiplierMin: number
  fleeSizeMultiplierMax: number
  fleePredatorScaleOffset: number
  fleePredatorScaleRange: number
  fleeThreatProximityBase: number
  fleeThreatDistanceFloor: number
  fleeThreatProximityWeight: number
  fleeThreatAwarenessWeight: number
  fleeThreatCowardiceWeight: number
  fleeThreatScoreMax: number
  fleeCowardiceClampMax: number
  fleeSpeedFloor: number
  fleeTriggerAwarenessWeight: number
  fleeTriggerFearWeight: number
  fleeTriggerCourageWeight: number
  fleeTriggerNormalization: number
  fleeTriggerClampMin: number
  fleeTriggerClampMax: number
  fleeDangerTimerMin: number
  fleeDangerHoldIntensityOffset: number
  fleeDangerHoldIntensityMin: number
  fleeDangerHoldIntensityMax: number
  fleeDangerIntensityBase: number
  fleeDangerDecayStep: number
  fleeDangerDecayBase: number
  fleeDangerDecayAttentionOffset: number
  fleeDangerDecayAttentionScale: number
  fleeDangerDecayMin: number
  fleeDangerDecayMax: number
  fleeSpeedBoostBase: number
  fleeSpeedBoostStaminaScale: number
  fatCapacity: number
  fatBurnThreshold: number
  patrolThreshold: number
  aggression: number
  bravery: number
  power: number
  defence: number
  fightPersistence: number
  escapeTendency: number
  escapeDuration: number
  lingerRate: number
  dangerRadius: number
  attentionSpan: number
  libidoThreshold: number
  libidoGainRate: number
  libidoPressureBase: number
  libidoPressureStabilityWeight: number
  curiosityDriveBase: number
  curiosityDriveStabilityWeight: number
  exploreThreshold: number
  idleDriveBase: number
  idleDriveStabilityWeight: number
  idleThreshold: number
  // Distance (world units) at which mating can occur.
  mateRange: number
  // Libido ratio threshold (relative to libidoThreshold) to actively roam for mates.
  mateSearchLibidoRatioThreshold: number
  // Random-walk widening when roaming for mates.
  mateSearchTurnJitterScale: number
  // Base chance (per step) to pick a new random heading while mate-searching.
  mateSearchTurnChanceBase: number
  // Curiosity scaling for mate-search random heading changes.
  mateSearchTurnChanceCuriosityScale: number
  // Base post-mate cooldown duration (seconds).
  mateCooldownDuration: number
  // Cooldown decay: base speed and fertility scaling.
  mateCooldownScaleBase: number
  mateCooldownFertilityScale: number
  mateCooldownScaleMin: number
  mateCooldownScaleMax: number
  // Energy cost multiplier applied on mating (scale on gestationCost).
  mateEnergyCostScale: number
  // Pregnancy duration tuning.
  mateGestationBase: number
  mateGestationScale: number
  // Patrol/bonding behaviour weights and thresholds.
  patrolHerdCohesionWeight: number
  patrolHerdDependencyWeight: number
  patrolSocialPressureBase: number
  patrolSocialPressureStabilityWeight: number
  patrolSocialThresholdBase: number
  patrolSocialThresholdStabilityWeight: number
  // Movement multiplier while patrolling.
  patrolSpeedMultiplier: number
  mutationRate: number
  bodyMass: number
  metabolism: number
  turnRate: number
  curiosity: number
  cohesion: number
  fear: number
  cowardice: number
  speciesFear: number
  conspecificFear: number
  sizeFear: number
  // For hunters: preferred prey size relative to self (preyMass / hunterMass).
  // Smaller values bias toward hunting much smaller prey (safer/more successful).
  preySizeTargetRatio: number
  dependency: number
  independenceAge: number
  camo: number
  awareness: number
  fertility: number
  gestationCost: number
  moodStability: number
  // 0..1: >= 0.5 allows eating own archetype.
  cannibalism: number
  // 0..1: housing terrain preference (rock/open/plants/fertilizer).
  terrainPreference: number
  // Age in simulation years required before the agent can reproduce.
  // Must be in [1, 20]; species-level variation is encoded genetically.
  maturityAgeYears?: number
  // Age in simulation years required before the agent can reproduce.
  // Must be in [0.1, 6]; allows reproduction earlier than full body maturity.
  reproductionMaturityAgeYears: number
  preferredFood: Archetype[]
  stamina: number
  circadianBias: number
  sleepEfficiency: number
  scavengerAffinity: number
  senseUpkeep: number
  bodyPlanVersion: number
  bodyPlan: BodyPlanGenes
}

export type SenseKind = 'eye' | 'ear' | 'nose' | 'touch' | 'taste'
export type SenseAnchor = 'head' | 'torso' | 'limb' | 'tail'

// Normalized organ placement in body-local space (top-down).
// - x: forward/backward along heading (forward is +x), typically in [-0.6, 0.6]
// - y: left/right across the body (left is -y, right is +y), typically in [-0.6, 0.6]
// - angle: facing direction relative to current heading (0 = forward), in radians
export interface OrganPlacement {
  x: number
  y: number
  angle: number
}

export interface ChassisGene {
  length: number
  depth: number
  massBias: number
  flexibility: number
  plating: number
}

export interface SenseGene {
  sense: SenseKind
  count: number
  distribution: SenseAnchor
  acuity: number
  energyCost?: number
  layout?: {
    placements: OrganPlacement[]
  }
}

export type LegPlacement = 'front' | 'mid' | 'rear' | 'mixed'

export interface LegMount {
  x: number
  side: -1 | 1
}

export interface LegGene {
  kind: 'leg'
  count: number
  size: number
  placement: LegPlacement
  gaitStyle: number
  layout?: {
    mounts: LegMount[]
  }
}

export interface WingGene {
  kind: 'wing'
  count: number
  span: number
  surface: number
  articulation: number
}

export type LimbGene = LegGene | WingGene

export type AppendageGene =
  | {
      kind: 'fin'
      count: number
      size: number
      placement: 'dorsal' | 'ventral' | 'lateral' | 'tail'
      steeringBias: number
    }
  | {
      kind: 'tail'
      count: number
      size: number
      split: number
      layout?: {
        mounts: OrganPlacement[]
      }
    }
  | {
      kind: 'muscle-band'
      density: number
      flexibility: number
    }

export interface BodyPlanGenes {
  chassis: ChassisGene
  senses: SenseGene[]
  limbs: LimbGene[]
  appendages: AppendageGene[]
}

export interface LandLocomotionStats {
  strideLength: number
  legCount: number
  agility: number
}

export interface SwimLocomotionStats {
  thrust: number
  turnRate: number
  drift: number
}

export interface FlightLocomotionStats {
  lift: number
  glide: number
  takeoff: number
}

export interface MovementProfile {
  land?: LandLocomotionStats
  water?: SwimLocomotionStats
  air?: FlightLocomotionStats
}

export interface LegacyAgentLinks {
  gender?: 'm' | 'f'
  fightEnergyRate?: number
  patrol?: {
    x: number
    y: number
    set: boolean
  }
  dangerTime?: number
  dangerTimeLong?: number
  escapeTime?: number
  body?: {
    width: number
    height: number
    radius: number
  }
  className?: string
  fillColor?: string
}

export type AgentMode =
  | 'idle'
  | 'graze'
  | 'hunt'
  | 'flee'
  | 'mate'
  | 'patrol'
  | 'sleep'
  | 'fight'
  | 'digest'
  | 'recover'

export type MoodTier = 'survival' | 'physiological' | 'reproductive' | 'social' | 'growth'

export type MoodKind =
  | 'panic'
  | 'starving'
  | 'foraging'
  | 'exhausted'
  | 'seeking-mate'
  | 'bonding'
  | 'exploring'
  | 'idle'

export interface MoodState {
  stress: number
  focus: number
  social: number
  fatigue?: number
  kind?: MoodKind
  tier?: MoodTier
  intensity?: number
}

export interface AgentState {
  id: number
  dna: DNA
  // Phenotype mass (changes over lifetime); defaults to `dna.bodyMass` if absent.
  mass?: number
  position: Vector2
  velocity: Vector2
  heading: number
  // Runtime-only locomotion phase (used for leg animation/step timing).
  gaitPhase?: number
  energy: number
  fatStore: number
  // Age in "simulation years" (used for lifetime leveling).
  age: number
  mode: AgentMode
  mood: MoodState
  target: TargetRef | null
  escapeCooldown: number
  gestationTimer: number
  injuries: number
  libido: number
  sexCooldown: number
  legacy?: LegacyAgentLinks
  mutationMask?: number
}

export type TargetKind = 'agent' | 'plant' | 'corpse'

export interface TargetRef {
  id: number
  kind: TargetKind
}

export interface PlantDNA {
  biomass: number
  regrowthRate: number
  seedSpread: number
  pigment: string
  nutrientDensity: number
  thorns: number
  seasonPreference: number
}

export interface PlantState {
  id: number
  dna: PlantDNA
  position: Vector2
  size: number
  moisture: number
}

export type CorpseStage = 'fresh' | 'dead'

export interface CorpseState {
  id: number
  position: Vector2
  radius: number
  nutrients: number
  archetype?: Archetype
  stage?: CorpseStage
  freshTime?: number
  decay: number
  maxDecay: number
}

export interface ManureState {
  id: number
  position: Vector2
  radius: number
  nutrients: number
  decay: number
  maxDecay: number
}

export interface FertilizerState {
  id: number
  position: Vector2
  radius: number
  nutrients: number
}

export interface WorldConfig {
  bounds: Vector2
  maxAgents: number
  maxPlants: number
  timeStepMs: number
  spatialHashCellSize: number
  rngSeed: number
  persistence: 'localStorage' | 'cloud' | 'none'
}

export interface SimulationStats {
  totalBirths: number
  totalDeaths: number
  mutations: number
  averageFitness: number
}

export interface SimulationSnapshot {
  version: number
  config: WorldConfig
  tick: number
  agents: AgentState[]
  plants: PlantState[]
  corpses?: CorpseState[]
  manures?: ManureState[]
  fertilizers?: FertilizerState[]
  stats: SimulationStats
}

export interface SavedSnapshot {
  id: string
  label: string
  savedAt: number
  snapshot: SimulationSnapshot
}

export interface ControlState {
  speed: number
  paused: boolean
  maxAgents: number
  maxPlants: number
  mutationRate: number
  flockingStrength: number
  curiosityBias: number
  aggressionBias: number
  // Years required to reach genetic adult mass.
  maturityYears: number
  // Number of simulation ticks in one "year" (drives leveling).
  yearTicks: number
  // Scales how strongly body fat slows movement (0 = no penalty, 1 = default).
  fatSpeedPenalty: number
  // Global appetite scaling (multiplies the satiation line used by eating).
  satiationMultiplier: number
  // Energy cost (intake units) per 1.0 body-mass gain when converting surplus into lean mass.
  massBuildCost: number
  // --- Simulation tuning knobs (runtime) ---
  // Multiplies leg cadence (higher = faster steps).
  gaitCadenceScale: number
  // Stance threshold in [0, 1] for foot planting.
  stanceThreshold: number
  // Exponent applied to stance when converting to thrust (higher = peakier thrust, lower = smoother).
  thrustPower: number
  // Multiplies allowed lateral slip while feet are planted (lower = less drift).
  slipScale: number
  // Multiplies sensing energy upkeep (eyes/ears/noses/etc).
  senseUpkeepScale: number
  // Multiplies morphology energy upkeep (legs/tails/fins/wings).
  morphologyUpkeepScale: number
  // Legacy "master" debug toggle (enables all debug layers).
  debugOverlay: boolean
  // Debug: recolor agents by mood/mode.
  debugMoodOverlay: boolean
  // Debug: show sensing rays + mount markers.
  debugOrganOverlay: boolean
  lightweightVisuals: boolean
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  bounds: { x: 17280, y: 17280 },
  // 3 archetypes (hunter/prey/scavenger) -> default to 50 each.
  maxAgents: 300,
  maxPlants: 450,
  timeStepMs: 50,
  spatialHashCellSize: 64,
  rngSeed: Date.now(),
  persistence: 'none',
}

export const DEFAULT_CONTROLS: ControlState = {
  speed: 1,
  paused: false,
  maxAgents: 300,
  maxPlants: 450,
  mutationRate: 0.01,
  flockingStrength: 1,
  curiosityBias: 0,
  aggressionBias: 0,
  maturityYears: 6,
  yearTicks: 2400,
  fatSpeedPenalty: 1,
  satiationMultiplier: 1,
  massBuildCost: 35,
  gaitCadenceScale: 0.95,
  stanceThreshold: 0.54,
  thrustPower: 1.2,
  slipScale: 0.8,
  senseUpkeepScale: 1,
  morphologyUpkeepScale: 1,
  debugOverlay: false,
  debugMoodOverlay: false,
  debugOrganOverlay: false,
  lightweightVisuals: false,
}

export interface ModeLegendEntry {
  mode: AgentMode
  color: string
  label: string
}

export const MODE_LEGEND: ModeLegendEntry[] = [
  { mode: 'sleep', color: '#6b7280', label: 'Sleep' },
  { mode: 'hunt', color: '#2563eb', label: 'Hunt' },
  { mode: 'graze', color: '#db8f27', label: 'Graze' },
  { mode: 'flee', color: '#dc2626', label: 'Flee' },
  { mode: 'mate', color: '#ec4899', label: 'Mate' },
  { mode: 'patrol', color: '#f97316', label: 'Patrol' },
  { mode: 'fight', color: '#16a34a', label: 'Fight' },
  { mode: 'idle', color: '#9ca3af', label: 'Idle' },
]
