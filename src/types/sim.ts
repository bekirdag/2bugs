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
  // When `Energy.value / hungerLine` drops below this ratio, the agent begins actively searching for food.
  // Higher values => starts foraging earlier (more proactive); lower values => waits longer (more risk).
  forageStartRatio: number
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
}

export type LegPlacement = 'front' | 'mid' | 'rear' | 'mixed'

export interface LegGene {
  kind: 'leg'
  count: number
  size: number
  placement: LegPlacement
  gaitStyle: number
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
      size: number
      split: number
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

export interface CorpseState {
  id: number
  position: Vector2
  radius: number
  nutrients: number
  decay: number
  maxDecay: number
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
  debugOverlay: boolean
  lightweightVisuals: boolean
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  bounds: { x: 17280, y: 17280 },
  // 3 archetypes (hunter/prey/scavenger) -> default to 50 each.
  maxAgents: 150,
  maxPlants: 900,
  timeStepMs: 50,
  spatialHashCellSize: 64,
  rngSeed: Date.now(),
  persistence: 'none',
}

export const DEFAULT_CONTROLS: ControlState = {
  speed: 1,
  paused: false,
  maxAgents: 150,
  maxPlants: 900,
  mutationRate: 0.01,
  flockingStrength: 1,
  curiosityBias: 0,
  aggressionBias: 0,
  debugOverlay: false,
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
