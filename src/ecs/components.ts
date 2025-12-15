import { Types, defineComponent } from 'bitecs'

export enum ArchetypeCode {
  Hunter = 1,
  Prey = 2,
  Plant = 3,
  Scavenger = 4,
}

export const Position = defineComponent({
  x: Types.f32,
  y: Types.f32,
})

export const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
})

// Runtime angular velocity (used by physics-like land locomotion).
export const AngularVelocity = defineComponent({
  omega: Types.f32,
})

export const Heading = defineComponent({
  angle: Types.f32,
  turnRate: Types.f32,
})

export const AgentMeta = defineComponent({
  id: Types.ui32,
  archetype: Types.ui8,
  familyColor: Types.ui32,
})

export const Energy = defineComponent({
  value: Types.f32,
  fatStore: Types.f32,
  fatCapacity: Types.f32,
  metabolism: Types.f32,
  sleepDebt: Types.f32,
})

// Tracks food intake that will later be converted into manure.
export const Digestion = defineComponent({
  // Total intake accumulated since last manure drop.
  intakeSinceManure: Types.f32,
  // Recently eaten intake (used to size droppings by "how much it ate"); should be decayed by a system.
  recentIntake: Types.f32,
})

export const DNA = defineComponent({
  baseSpeed: Types.f32,
  visionRange: Types.f32,
  aggression: Types.f32,
  fear: Types.f32,
  curiosity: Types.f32,
  socialDrive: Types.f32,
  sleepNeed: Types.f32,
  fertility: Types.f32,
  mutationRate: Types.f32,
  metabolism: Types.f32,
  cowardice: Types.f32,
  speciesFear: Types.f32,
  conspecificFear: Types.f32,
  sizeFear: Types.f32,
  gestationCost: Types.f32,
  dependency: Types.f32,
  independenceAge: Types.f32,
  stamina: Types.f32,
  circadianBias: Types.f32,
  sleepEfficiency: Types.f32,
  scavengerAffinity: Types.f32,
  camo: Types.f32,
  awareness: Types.f32,
  moodStability: Types.f32,
  senseUpkeep: Types.f32,
})

export const GenomeFlags = defineComponent({
  mutationMask: Types.ui32,
})

export const Mood = defineComponent({
  stress: Types.f32,
  focus: Types.f32,
  social: Types.f32,
  fatigue: Types.f32,
  state: Types.ui8,
  tier: Types.ui8,
  intensity: Types.f32,
})

export const ModeState = defineComponent({
  mode: Types.ui8,
  targetType: Types.ui8,
  targetId: Types.ui32,
  dangerTimer: Types.f32,
  sexCooldown: Types.f32,
  gestationTimer: Types.f32,
})

// High-level decision output ("brain intent") that gets committed into `ModeState` for actuation.
// Keeping intent separate avoids multiple systems "fighting" over `ModeState.mode/target`.
export const Intent = defineComponent({
  mode: Types.ui8,
  targetType: Types.ui8,
  targetId: Types.ui32,
})

export const Perception = defineComponent({
  predatorCount: Types.ui8,
  nearbyAllies: Types.ui8,
  flockCenterX: Types.f32,
  flockCenterY: Types.f32,
})

export const Reproduction = defineComponent({
  libido: Types.f32,
  libidoThreshold: Types.f32,
  mateId: Types.ui32,
})

export const PlantStats = defineComponent({
  biomass: Types.f32,
  nutrientDensity: Types.f32,
  moisture: Types.f32,
  regrowthRate: Types.f32,
  seasonPhase: Types.f32,
})

export const Obstacle = defineComponent({
  radius: Types.f32,
})

export const Corpse = defineComponent({
  nutrients: Types.f32,
  decay: Types.f32,
  maxDecay: Types.f32,
  radius: Types.f32,
})

// Non-edible droppings that decay quickly into fertilizer.
export const Manure = defineComponent({
  nutrients: Types.f32,
  decay: Types.f32,
  maxDecay: Types.f32,
  radius: Types.f32,
})

// Persistent soil nutrients deposited by dissolved corpses/manure.
// Does not decay on its own; plants consume it to grow.
export const Fertilizer = defineComponent({
  nutrients: Types.f32,
  radius: Types.f32,
})

// Phenotype state (not inherited directly): animals can grow their current mass toward genetic `dna.bodyMass`.
export const Body = defineComponent({
  mass: Types.f32,
})

export const AgentRef = defineComponent({
  id: Types.ui32,
})

// Runtime-only locomotion state (not serialized into snapshots).
export const LocomotionState = defineComponent({
  gaitPhase: Types.f32,
})
