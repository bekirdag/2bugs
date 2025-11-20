import { addComponent, addEntity } from 'bitecs'
import type { IWorld } from 'bitecs'

import {
  AgentMeta,
  DNA,
  Energy,
  GenomeFlags,
  Heading,
  ModeState,
  Mood,
  Perception,
  PlantStats,
  Position,
  Reproduction,
  Velocity,
  ArchetypeCode,
} from './components'
import { decodeMoodKind, decodeMoodTier, encodeMoodKind, encodeMoodTier } from './mood/moodCatalog'

import type { AgentState, PlantState, DNA as DNAState } from '@/types/sim'
import { clamp } from '@/utils/math'
import { BODY_PLAN_VERSION, createBaseBodyPlan, cloneBodyPlan } from '@/ecs/bodyPlan'

export interface EntityRegistry {
  world: IWorld
}

export const COMPONENTS = {
  Position,
  Velocity,
  Heading,
  AgentMeta,
  DNA,
  GenomeFlags,
  Energy,
  Mood,
  ModeState,
  Perception,
  Reproduction,
  PlantStats,
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
  addComponent(registry.world, Heading, entity)
  addComponent(registry.world, AgentMeta, entity)
  addComponent(registry.world, DNA, entity)
  addComponent(registry.world, GenomeFlags, entity)
  addComponent(registry.world, Energy, entity)
  addComponent(registry.world, Mood, entity)
  addComponent(registry.world, ModeState, entity)
  addComponent(registry.world, Perception, entity)
  addComponent(registry.world, Reproduction, entity)

  hydrateAgentEntity(entity, state)
  return entity
}

export function hydrateAgentEntity(entity: number, state: AgentState) {
  Position.x[entity] = state.position.x
  Position.y[entity] = state.position.y
  Velocity.x[entity] = state.velocity.x
  Velocity.y[entity] = state.velocity.y
  Heading.angle[entity] = state.heading
  Heading.turnRate[entity] = 0
  AgentMeta.id[entity] = state.id
  AgentMeta.archetype[entity] = archetypeCode(state)
  AgentMeta.familyColor[entity] = parseInt(state.dna.familyColor.replace('#', ''), 16)
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
  DNA.senseUpkeep[entity] = state.dna.senseUpkeep ?? 0
  Energy.value[entity] = state.energy
  Energy.fatStore[entity] = state.fatStore
  Energy.fatCapacity[entity] = state.dna.fatCapacity
  Energy.metabolism[entity] = state.dna.metabolism ?? 8
  Energy.sleepDebt[entity] = state.mood.stress ?? 0
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
  Reproduction.libido[entity] = state.libido
  Reproduction.libidoThreshold[entity] = state.dna.libidoThreshold ?? 0.6
  Reproduction.mateId[entity] = 0
  GenomeFlags.mutationMask[entity] = state.mutationMask ?? 0
}

export function serializeAgentEntity(entity: number, genomeOverride?: DNAState): AgentState {
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
    position: {
      x: Position.x[entity],
      y: Position.y[entity],
    },
    velocity: {
      x: Velocity.x[entity],
      y: Velocity.y[entity],
    },
    heading: Heading.angle[entity],
    energy: Energy.value[entity],
    fatStore: Energy.fatStore[entity],
    age: 0,
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
    default:
      return 0
  }
}

function decodeTarget(code: number): NonNullable<AgentState['target']>['kind'] {
  return code === 2 ? 'plant' : 'agent'
}

function composeSnapshotDNA(entity: number): DNAState {
  const archetype = decodeArchetype(AgentMeta.archetype[entity])
  const familyColor = `#${AgentMeta.familyColor[entity].toString(16).padStart(6, '0')}`
  const aggression = DNA.aggression[entity] ?? 0.3
  const fear = DNA.fear[entity] ?? 0.3
  const curiosity = DNA.curiosity[entity] ?? 0.4
  const fertility = DNA.fertility[entity] ?? 0.3
  const mutationRate = DNA.mutationRate[entity] ?? 0.01
  const fatCapacity = Energy.fatCapacity[entity] || 100
  const metabolism = Energy.metabolism[entity] || 8
  const vision = DNA.visionRange[entity] || 200
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
    hungerThreshold: metabolism * 8,
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
    libidoThreshold: Reproduction.libidoThreshold[entity] || 0.6,
    libidoGainRate: clamp(fertility * 0.4, 0.01, 0.2),
    mutationRate,
    bodyMass: clamp(fatCapacity / 120, 0.5, 20),
    metabolism,
    turnRate: clamp(curiosity * 2, 0.3, 3),
    curiosity,
    cohesion: DNA.socialDrive[entity] ?? 0.3,
    fear,
    cowardice,
    speciesFear,
    conspecificFear,
    sizeFear,
    dependency,
    independenceAge,
    camo: DNA.camo[entity] ?? 0.3,
    awareness: DNA.awareness[entity] ?? clamp(vision / 360, 0.2, 1),
    fertility: DNA.fertility[entity] ?? fertility,
    gestationCost: clamp(metabolism * 1.5, 5, 40),
    moodStability: DNA.moodStability[entity] ?? clamp(1 - (Mood.stress[entity] ?? 0.5), 0.1, 1),
    preferredFood:
      archetype === 'hunter'
        ? ['prey']
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
