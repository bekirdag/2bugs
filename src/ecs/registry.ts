import { addComponent, addEntity } from 'bitecs'
import type { IWorld } from 'bitecs'

import {
  AgentMeta,
  Body,
  Corpse,
  Digestion,
  Fertilizer,
  Manure,
  DNA,
  Energy,
  AngularVelocity,
  GenomeFlags,
  Heading,
  Intent,
  ModeState,
  Mood,
  Obstacle,
  Perception,
  PlantStats,
  Position,
  Reproduction,
  Velocity,
  ArchetypeCode,
  LocomotionState,
} from './components'
import { decodeMoodKind, decodeMoodTier, encodeMoodKind, encodeMoodTier } from './mood/moodCatalog'
import { decodeCorpseStage, encodeCorpseStage, CORPSE_STAGE } from './corpseStages'

import type { AgentState, CorpseState, FertilizerState, ManureState, PlantState, DNA as DNAState } from '@/types/sim'
import { clamp } from '@/utils/math'
import { BODY_PLAN_VERSION, createBaseBodyPlan, cloneBodyPlan } from '@/ecs/bodyPlan'

export interface EntityRegistry {
  world: IWorld
}

export const COMPONENTS = {
  Position,
  Velocity,
  AngularVelocity,
  Heading,
  AgentMeta,
  Body,
  DNA,
  GenomeFlags,
  Energy,
  Digestion,
  Mood,
  ModeState,
  Intent,
  Perception,
  Reproduction,
  LocomotionState,
  PlantStats,
  Obstacle,
  Corpse,
  Manure,
  Fertilizer,
} as const

export function createRegistry(world: IWorld): EntityRegistry {
  return {
    world,
  }
}

export function spawnAgentEntity(registry: EntityRegistry, state: AgentState): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, Velocity, entity)
  addComponent(registry.world, AngularVelocity, entity)
  addComponent(registry.world, Heading, entity)
  addComponent(registry.world, AgentMeta, entity)
  addComponent(registry.world, Body, entity)
  addComponent(registry.world, DNA, entity)
  addComponent(registry.world, GenomeFlags, entity)
  addComponent(registry.world, Energy, entity)
  addComponent(registry.world, Digestion, entity)
  addComponent(registry.world, Mood, entity)
  addComponent(registry.world, ModeState, entity)
  addComponent(registry.world, Intent, entity)
  addComponent(registry.world, Perception, entity)
  addComponent(registry.world, Reproduction, entity)
  addComponent(registry.world, LocomotionState, entity)

  hydrateAgentEntity(entity, state)
  return entity
}

export function hydrateAgentEntity(entity: number, state: AgentState) {
  Position.x[entity] = state.position.x
  Position.y[entity] = state.position.y
  Velocity.x[entity] = state.velocity.x
  Velocity.y[entity] = state.velocity.y
  AngularVelocity.omega[entity] = 0
  Heading.angle[entity] = state.heading
  Heading.turnRate[entity] = 0
  AgentMeta.id[entity] = state.id
  AgentMeta.archetype[entity] = archetypeCode(state)
  AgentMeta.familyColor[entity] = parseInt(state.dna.familyColor.replace('#', ''), 16)
  Body.mass[entity] = state.mass ?? state.dna.bodyMass
  DNA.baseSpeed[entity] = state.dna.baseSpeed
  DNA.visionRange[entity] = state.dna.visionRange
  DNA.aggression[entity] = state.dna.aggression
  DNA.fear[entity] = state.dna.fear ?? 0.4
  DNA.curiosity[entity] = state.dna.curiosity
  DNA.socialDrive[entity] = state.dna.cohesion ?? 0.3
  DNA.sleepNeed[entity] = state.dna.metabolism ?? 8
  DNA.fertility[entity] = state.dna.fertility ?? 0.4
  DNA.mutationRate[entity] = state.dna.mutationRate ?? 0.01
  DNA.metabolism[entity] = state.dna.metabolism ?? 8
  DNA.hungerThreshold[entity] = state.dna.hungerThreshold ?? 60
  DNA.fatCapacity[entity] = state.dna.fatCapacity ?? 100
  DNA.hungerRestMultiplier[entity] = state.dna.hungerRestMultiplier ?? 1.5
  DNA.hungerSurvivalBufferScale[entity] = state.dna.hungerSurvivalBufferScale ?? 0.08
  DNA.growthReserveBase[entity] = state.dna.growthReserveBase ?? 0.95
  DNA.growthReserveGreedScale[entity] = state.dna.growthReserveGreedScale ?? 0.35
  DNA.satiationBase[entity] = state.dna.satiationBase ?? 0.9
  DNA.satiationGreedScale[entity] = state.dna.satiationGreedScale ?? 1.3
  DNA.patrolThresholdMinScale[entity] = state.dna.patrolThresholdMinScale ?? 0.2
  DNA.patrolThresholdMaxScale[entity] = state.dna.patrolThresholdMaxScale ?? 1.2
  DNA.initialEnergyBirthMultiplier[entity] = state.dna.initialEnergyBirthMultiplier ?? 2.5
  DNA.initialEnergySeedMultiplier[entity] = state.dna.initialEnergySeedMultiplier ?? 3
  DNA.cowardice[entity] = state.dna.cowardice ?? state.dna.fear ?? 0.3
  DNA.speciesFear[entity] = state.dna.speciesFear ?? state.dna.fear ?? 0.3
  DNA.conspecificFear[entity] = state.dna.conspecificFear ?? 0.25
  DNA.sizeFear[entity] = state.dna.sizeFear ?? 0.5
  DNA.gestationCost[entity] = state.dna.gestationCost ?? 0
  DNA.stamina[entity] = state.dna.stamina ?? 1
  DNA.circadianBias[entity] = state.dna.circadianBias ?? 0
  DNA.sleepEfficiency[entity] = state.dna.sleepEfficiency ?? 0.8
  DNA.scavengerAffinity[entity] = state.dna.scavengerAffinity ?? 0
  DNA.camo[entity] = state.dna.camo ?? 0.3
  DNA.awareness[entity] = state.dna.awareness ?? 0.5
  DNA.moodStability[entity] = state.dna.moodStability ?? 0.5
  DNA.cannibalism[entity] = state.dna.cannibalism ?? 0
  DNA.terrainPreference[entity] = state.dna.terrainPreference ?? 0.5
  DNA.mateRange[entity] = state.dna.mateRange
  DNA.senseUpkeep[entity] = state.dna.senseUpkeep ?? 0
  Energy.value[entity] = state.energy
  Energy.fatStore[entity] = state.fatStore
  Energy.fatCapacity[entity] = DNA.fatCapacity[entity]
  Energy.metabolism[entity] = state.dna.metabolism ?? 8
  Energy.sleepDebt[entity] = state.mood.stress ?? 0
  Digestion.intakeSinceManure[entity] = 0
  Digestion.recentIntake[entity] = 0
  Mood.stress[entity] = state.mood.stress
  Mood.focus[entity] = state.mood.focus
  Mood.social[entity] = state.mood.social
  Mood.fatigue[entity] = state.mood.fatigue ?? 0
  Mood.state[entity] = encodeMoodKind(state.mood.kind)
  Mood.tier[entity] = encodeMoodTier(state.mood.tier)
  Mood.intensity[entity] = state.mood.intensity ?? 0
  ModeState.mode[entity] = encodeMode(state.mode)
  ModeState.targetType[entity] = state.target ? encodeTarget(state.target.kind) : 0
  ModeState.targetId[entity] = state.target?.id ?? 0
  ModeState.dangerTimer[entity] = state.escapeCooldown
  ModeState.sexCooldown[entity] = state.sexCooldown
  ModeState.gestationTimer[entity] = state.gestationTimer
  Intent.mode[entity] = ModeState.mode[entity]
  Intent.targetType[entity] = ModeState.targetType[entity]
  Intent.targetId[entity] = ModeState.targetId[entity]
  Reproduction.libido[entity] = state.libido
  Reproduction.libidoThreshold[entity] = state.dna.libidoThreshold
  Reproduction.mateId[entity] = 0
  GenomeFlags.mutationMask[entity] = state.mutationMask ?? 0

  // Deterministic gait seeding (avoid Math.random for sim determinism).
  LocomotionState.gaitPhase[entity] =
    typeof state.gaitPhase === 'number' && Number.isFinite(state.gaitPhase)
      ? state.gaitPhase
      : ((state.id * 9973) % 6283) / 1000
}

export function serializeAgentEntity(entity: number, ageYears = 0, genomeOverride?: DNAState): AgentState {
  let dnaState = composeSnapshotDNA(entity)
  if (genomeOverride) {
    dnaState = {
      ...dnaState,
      ...genomeOverride,
      bodyPlan: cloneBodyPlan(genomeOverride.bodyPlan),
    }
  }
  return {
    id: AgentMeta.id[entity],
    dna: dnaState,
    mass: Body.mass[entity] || dnaState.bodyMass,
    position: {
      x: Position.x[entity],
      y: Position.y[entity],
    },
    velocity: {
      x: Velocity.x[entity],
      y: Velocity.y[entity],
    },
    heading: Heading.angle[entity],
    gaitPhase: LocomotionState.gaitPhase[entity] ?? 0,
    energy: Energy.value[entity],
    fatStore: Energy.fatStore[entity],
    age: ageYears,
    mode: decodeMode(ModeState.mode[entity]),
    mood: {
      stress: Mood.stress[entity],
      focus: Mood.focus[entity],
      social: Mood.social[entity],
      fatigue: Mood.fatigue[entity],
      kind: decodeMoodKind(Mood.state[entity]),
      tier: decodeMoodTier(Mood.tier[entity]),
      intensity: Mood.intensity[entity],
    },
    escapeCooldown: ModeState.dangerTimer[entity],
    gestationTimer: ModeState.gestationTimer[entity],
    injuries: 0,
    target: ModeState.targetType[entity]
      ? {
          kind: decodeTarget(ModeState.targetType[entity]),
          id: ModeState.targetId[entity],
        }
      : null,
    libido: Reproduction.libido[entity],
    sexCooldown: ModeState.sexCooldown[entity],
    mutationMask: GenomeFlags.mutationMask[entity],
  }
}

export function spawnPlantEntity(registry: EntityRegistry, plant: PlantState): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, PlantStats, entity)

  Position.x[entity] = plant.position.x
  Position.y[entity] = plant.position.y
  PlantStats.biomass[entity] = plant.dna.biomass
  PlantStats.nutrientDensity[entity] = plant.dna.nutrientDensity
  PlantStats.moisture[entity] = plant.moisture
  PlantStats.regrowthRate[entity] = plant.dna.regrowthRate
  PlantStats.seasonPhase[entity] = plant.dna.seasonPreference ?? 0

  return entity
}

export function spawnRockEntity(
  registry: EntityRegistry,
  rock: { position: { x: number; y: number }; radius: number },
): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, Obstacle, entity)
  Position.x[entity] = rock.position.x
  Position.y[entity] = rock.position.y
  Obstacle.radius[entity] = rock.radius
  return entity
}

export function spawnCorpseEntity(
  registry: EntityRegistry,
  corpse: {
    position: { x: number; y: number }
    radius: number
    nutrients: number
    decay: number
    maxDecay: number
    stage?: CorpseState['stage']
    archetype?: CorpseState['archetype']
    freshTime?: number
  },
): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, Corpse, entity)
  Position.x[entity] = corpse.position.x
  Position.y[entity] = corpse.position.y
  Corpse.radius[entity] = corpse.radius
  Corpse.nutrients[entity] = corpse.nutrients
  Corpse.decay[entity] = corpse.decay
  Corpse.maxDecay[entity] = corpse.maxDecay
  const stage = encodeCorpseStage(corpse.stage)
  Corpse.stage[entity] = stage
  const fallbackFresh =
    stage === CORPSE_STAGE.Fresh ? Math.min(corpse.maxDecay * 0.25, 180) : 0
  Corpse.freshTime[entity] = corpse.freshTime ?? fallbackFresh
  Corpse.archetype[entity] = corpse.archetype ? encodeArchetype(corpse.archetype) : 0
  return entity
}

export function spawnManureEntity(
  registry: EntityRegistry,
  manure: { position: { x: number; y: number }; radius: number; nutrients: number; decay: number; maxDecay: number },
): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, Manure, entity)
  Position.x[entity] = manure.position.x
  Position.y[entity] = manure.position.y
  Manure.radius[entity] = manure.radius
  Manure.nutrients[entity] = manure.nutrients
  Manure.decay[entity] = manure.decay
  Manure.maxDecay[entity] = manure.maxDecay
  return entity
}

export function spawnFertilizerEntity(
  registry: EntityRegistry,
  fertilizer: { position: { x: number; y: number }; radius: number; nutrients: number },
): number {
  const entity = addEntity(registry.world)
  addComponent(registry.world, Position, entity)
  addComponent(registry.world, Fertilizer, entity)
  Position.x[entity] = fertilizer.position.x
  Position.y[entity] = fertilizer.position.y
  Fertilizer.radius[entity] = fertilizer.radius
  Fertilizer.nutrients[entity] = fertilizer.nutrients
  return entity
}

export function serializePlantEntity(entity: number, id: number): PlantState {
  return {
    id,
    dna: {
      biomass: PlantStats.biomass[entity],
      nutrientDensity: PlantStats.nutrientDensity[entity],
      regrowthRate: PlantStats.regrowthRate[entity],
      pigment: '#2ab811',
      seedSpread: 0.5,
      thorns: PlantStats.seasonPhase[entity],
      seasonPreference: PlantStats.seasonPhase[entity],
    },
    position: {
      x: Position.x[entity],
      y: Position.y[entity],
    },
    size: PlantStats.biomass[entity],
    moisture: PlantStats.moisture[entity],
  }
}

export function serializeCorpseEntity(entity: number, id: number): CorpseState {
  return {
    id,
    position: { x: Position.x[entity], y: Position.y[entity] },
    radius: Corpse.radius[entity],
    nutrients: Corpse.nutrients[entity],
    archetype: Corpse.archetype[entity] ? decodeArchetype(Corpse.archetype[entity]) : undefined,
    stage: decodeCorpseStage(Corpse.stage[entity]),
    freshTime: Corpse.freshTime[entity],
    decay: Corpse.decay[entity],
    maxDecay: Corpse.maxDecay[entity],
  }
}

export function serializeManureEntity(entity: number, id: number): ManureState {
  return {
    id,
    position: { x: Position.x[entity], y: Position.y[entity] },
    radius: Manure.radius[entity],
    nutrients: Manure.nutrients[entity],
    decay: Manure.decay[entity],
    maxDecay: Manure.maxDecay[entity],
  }
}

export function serializeFertilizerEntity(entity: number, id: number): FertilizerState {
  return {
    id,
    position: { x: Position.x[entity], y: Position.y[entity] },
    radius: Fertilizer.radius[entity],
    nutrients: Fertilizer.nutrients[entity],
  }
}

function archetypeCode(state: AgentState) {
  switch (state.dna.archetype) {
    case 'hunter':
      return ArchetypeCode.Hunter
    case 'prey':
      return ArchetypeCode.Prey
    case 'plant':
      return ArchetypeCode.Plant
    case 'scavenger':
      return ArchetypeCode.Scavenger
    default:
      return ArchetypeCode.Prey
  }
}

function decodeArchetype(code: number): AgentState['dna']['archetype'] {
  switch (code) {
    case ArchetypeCode.Hunter:
      return 'hunter'
    case ArchetypeCode.Prey:
      return 'prey'
    case ArchetypeCode.Scavenger:
      return 'scavenger'
    default:
      return 'prey'
  }
}

function encodeArchetype(archetype: AgentState['dna']['archetype']): number {
  switch (archetype) {
    case 'hunter':
      return ArchetypeCode.Hunter
    case 'prey':
      return ArchetypeCode.Prey
    case 'scavenger':
      return ArchetypeCode.Scavenger
    default:
      return ArchetypeCode.Prey
  }
}

function encodeMode(mode: AgentState['mode']): number {
  const map: Record<AgentState['mode'], number> = {
    sleep: 1,
    graze: 2,
    hunt: 3,
    flee: 4,
    mate: 5,
    patrol: 6,
    fight: 7,
    idle: 8,
    digest: 9,
    recover: 10,
  }
  return map[mode] ?? 1
}

function decodeMode(code: number): AgentState['mode'] {
  const map: Record<number, AgentState['mode']> = {
    1: 'sleep',
    2: 'graze',
    3: 'hunt',
    4: 'flee',
    5: 'mate',
    6: 'patrol',
    7: 'fight',
    8: 'idle',
    9: 'digest',
    10: 'recover',
  }
  return map[code] ?? 'sleep'
}

function encodeTarget(kind: NonNullable<AgentState['target']>['kind']): number {
  switch (kind) {
    case 'agent':
      return 1
    case 'plant':
      return 2
    case 'corpse':
      return 3
    default:
      return 0
  }
}

function decodeTarget(code: number): NonNullable<AgentState['target']>['kind'] {
  if (code === 2) return 'plant'
  if (code === 3) return 'corpse'
  return 'agent'
}

function composeSnapshotDNA(entity: number): DNAState {
  const archetype = decodeArchetype(AgentMeta.archetype[entity])
  const familyColor = `#${AgentMeta.familyColor[entity].toString(16).padStart(6, '0')}`
  const aggression = DNA.aggression[entity] ?? 0.3
  const fear = DNA.fear[entity] ?? 0.3
  const curiosity = DNA.curiosity[entity] ?? 0.4
  const fertility = DNA.fertility[entity] ?? 0.3
  const mutationRate = DNA.mutationRate[entity] ?? 0.01
  const metabolism = DNA.metabolism[entity] ?? Energy.metabolism[entity] ?? 8
  const fatCapacity = DNA.fatCapacity[entity] ?? Energy.fatCapacity[entity] ?? 100
  const vision = DNA.visionRange[entity] || 200
  const cannibalism = DNA.cannibalism[entity] ?? 0
  const terrainPreference = DNA.terrainPreference[entity] ?? 0.5
  const mateRange = DNA.mateRange[entity] ?? 32
  const bodyMass = clamp(fatCapacity / 120, 0.5, 20)
  const maturityAgeYears = clamp(
    1 + Math.pow(clamp(bodyMass, 0.2, 80), 0.55) * 2.8 + (archetype === 'hunter' ? 1.6 : archetype === 'scavenger' ? 1 : 0),
    1,
    20,
  )
  const reproductionMaturityAgeYears = clamp(Math.min(6, maturityAgeYears * 0.5), 0.1, 6)
  const libidoPressureBase = 0.8
  const libidoPressureStabilityWeight = 0.25
  const mateSearchLibidoRatioThreshold = 1
  const mateSearchTurnJitterScale = 2.75
  const mateSearchTurnChanceBase = 0.18
  const mateSearchTurnChanceCuriosityScale = 0.22
  const mateCooldownDuration = 5
  const mateCooldownScaleBase = 0.7
  const mateCooldownFertilityScale = 1
  const mateCooldownScaleMin = 0.6
  const mateCooldownScaleMax = 1.7
  const mateEnergyCostScale = 1.5
  const mateGestationBase = 6
  const mateGestationScale = 0.6
  const patrolHerdCohesionWeight = 0.6
  const patrolHerdDependencyWeight = 0.4
  const patrolSocialPressureBase = 1.05
  const patrolSocialPressureStabilityWeight = 0.1
  const patrolSocialThresholdBase = 0.52
  const patrolSocialThresholdStabilityWeight = 0.08
  const patrolSpeedMultiplier = 1.05
  const curiosityDriveBase = 0.7
  const curiosityDriveStabilityWeight = 0.4
  const exploreThreshold = 0.52
  const idleDriveBase = 0.6
  const idleDriveStabilityWeight = 0.6
  const idleThreshold = 0.55
  const forageStartRatio = DNA.curiosity[entity] ? clamp(0.55 + (DNA.curiosity[entity] ?? 0.3) * 0.35, 0.35, 0.95) : 0.65
  const cowardice = DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3
  const speciesFear = DNA.speciesFear[entity] ?? fear
  const conspecificFear = DNA.conspecificFear[entity] ?? 0.25
  const sizeFear = DNA.sizeFear[entity] ?? 0.5
  const dependency = DNA.dependency[entity] ?? 0.5
  const independenceAge = DNA.independenceAge[entity] ?? 20

  return {
    archetype,
    biome: 'land',
    familyColor,
    baseSpeed: DNA.baseSpeed[entity] || 200,
    visionRange: vision,
    hungerThreshold: DNA.hungerThreshold[entity] ?? 60,
    hungerRestMultiplier: DNA.hungerRestMultiplier[entity] ?? 1.5,
    hungerSurvivalBufferScale: DNA.hungerSurvivalBufferScale[entity] ?? 0.08,
    growthReserveBase: DNA.growthReserveBase[entity] ?? 0.95,
    growthReserveGreedScale: DNA.growthReserveGreedScale[entity] ?? 0.35,
    satiationBase: DNA.satiationBase[entity] ?? 0.9,
    satiationGreedScale: DNA.satiationGreedScale[entity] ?? 1.3,
    patrolThresholdMinScale: DNA.patrolThresholdMinScale[entity] ?? 0.2,
    patrolThresholdMaxScale: DNA.patrolThresholdMaxScale[entity] ?? 1.2,
    initialEnergyBirthMultiplier: DNA.initialEnergyBirthMultiplier[entity] ?? 2.5,
    initialEnergySeedMultiplier: DNA.initialEnergySeedMultiplier[entity] ?? 3,
    forageStartRatio,
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
    fatCapacity,
    fatBurnThreshold: fatCapacity * 0.5,
    patrolThreshold: curiosity * 100,
    aggression,
    bravery: clamp(1 - fear, 0.1, 1),
    power: 80,
    defence: 60,
    fightPersistence: clamp(aggression, 0.05, 1),
    escapeTendency: clamp(fear + 0.15, 0.05, 1),
    escapeDuration: 2,
    lingerRate: clamp(curiosity, 0.1, 1),
    dangerRadius: Math.max(120, vision * 0.5),
    attentionSpan: 0.5,
    libidoThreshold: Reproduction.libidoThreshold[entity],
    libidoGainRate: clamp(fertility * 0.4, 0.01, 0.2),
    libidoPressureBase,
    libidoPressureStabilityWeight,
    mateSearchLibidoRatioThreshold,
    mateSearchTurnJitterScale,
    mateSearchTurnChanceBase,
    mateSearchTurnChanceCuriosityScale,
    mateCooldownDuration,
    mateCooldownScaleBase,
    mateCooldownFertilityScale,
    mateCooldownScaleMin,
    mateCooldownScaleMax,
    mateEnergyCostScale,
    mateGestationBase,
    mateGestationScale,
    patrolHerdCohesionWeight,
    patrolHerdDependencyWeight,
    patrolSocialPressureBase,
    patrolSocialPressureStabilityWeight,
    patrolSocialThresholdBase,
    patrolSocialThresholdStabilityWeight,
    patrolSpeedMultiplier,
    curiosityDriveBase,
    curiosityDriveStabilityWeight,
    exploreThreshold,
    idleDriveBase,
    idleDriveStabilityWeight,
    idleThreshold,
    mateRange,
    mutationRate,
    bodyMass,
    metabolism,
    turnRate: clamp(curiosity * 2, 0.3, 3),
    curiosity,
    cohesion: DNA.socialDrive[entity] ?? 0.3,
    fear,
    cowardice,
    speciesFear,
    conspecificFear,
    sizeFear,
    preySizeTargetRatio: archetype === 'hunter' ? 0.6 : 0.9,
    dependency,
    independenceAge,
    camo: DNA.camo[entity] ?? 0.3,
    awareness: DNA.awareness[entity] ?? clamp(vision / 360, 0.2, 1),
    fertility: DNA.fertility[entity] ?? fertility,
    gestationCost: clamp(metabolism * 1.5, 5, 40),
    moodStability: DNA.moodStability[entity] ?? clamp(1 - (Mood.stress[entity] ?? 0.5), 0.1, 1),
    cannibalism,
    terrainPreference,
    maturityAgeYears,
    reproductionMaturityAgeYears,
    preferredFood:
      archetype === 'hunter'
        ? cannibalism >= 0.5
          ? ['prey', 'scavenger', 'hunter']
          : ['prey', 'scavenger']
        : archetype === 'scavenger'
          ? []
        : DNA.scavengerAffinity[entity] > 0.4
          ? ['plant', 'scavenger']
          : ['plant'],
    stamina: DNA.stamina[entity] ?? 1,
    circadianBias: DNA.circadianBias[entity] ?? 0,
    sleepEfficiency: DNA.sleepEfficiency[entity] ?? 0.8,
    scavengerAffinity: DNA.scavengerAffinity[entity] ?? 0,
    senseUpkeep: DNA.senseUpkeep[entity] ?? 0,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(archetype, 'land'),
  }
}
