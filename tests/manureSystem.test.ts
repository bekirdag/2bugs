import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'
import { applyFoodIntake } from '../src/ecs/nutrition'
import { manureSystem } from '../src/ecs/systems/manureSystem'
import { plantGrowthSystem } from '../src/ecs/systems/plantSystem'
import { Fertilizer, Manure, PlantStats } from '../src/ecs/components'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const snapshot: SimulationSnapshot = {
  version: 1,
  config: { ...DEFAULT_WORLD_CONFIG, rngSeed: 2, maxAgents: 0, maxPlants: 0 },
  tick: 0,
  agents: [
    {
      id: 1,
      dna: {
        archetype: 'prey',
        biome: 'land',
        familyColor: '#00ff00',
        baseSpeed: 220,
        visionRange: 220,
        hungerThreshold: 60,
        forageStartRatio: 0.7,
        eatingGreed: 0.5,
        fatCapacity: 2400,
        fatBurnThreshold: 900,
        patrolThreshold: 40,
        aggression: 0.2,
        bravery: 0.2,
        power: 40,
        defence: 40,
        fightPersistence: 0.2,
        escapeTendency: 0.6,
        escapeDuration: 2,
        lingerRate: 0.5,
        dangerRadius: 140,
        attentionSpan: 0.6,
        libidoThreshold: 0.6,
        libidoGainRate: 0.05,
        libidoPressureBase: 0.8,
        libidoPressureStabilityWeight: 0.25,
        curiosityDriveBase: 0.7,
        curiosityDriveStabilityWeight: 0.4,
        exploreThreshold: 0.52,
        idleDriveBase: 0.6,
        idleDriveStabilityWeight: 0.6,
        idleThreshold: 0.55,
        mutationRate: 0.01,
        bodyMass: 8,
        metabolism: 8,
        turnRate: 1.5,
        curiosity: 0.4,
        cohesion: 0.3,
        fear: 0.3,
        cowardice: 0.3,
        speciesFear: 0.3,
        conspecificFear: 0.2,
        sizeFear: 0.4,
        preySizeTargetRatio: 0.9,
        dependency: 0.2,
        independenceAge: 20,
        camo: 0.2,
        awareness: 0.7,
        fertility: 0.4,
        gestationCost: 10,
        moodStability: 0.6,
        preferredFood: ['plant'],
        stamina: 1,
        circadianBias: 0,
        sleepEfficiency: 0.8,
        scavengerAffinity: 0,
        senseUpkeep: 0,
        bodyPlanVersion: 1,
        bodyPlan: {
          chassis: { length: 0.6, depth: 0.6, massBias: 0.6, flexibility: 0.5, plating: 0.4 },
          senses: [{ sense: 'eye', count: 2, distribution: 'head', acuity: 0.6 }],
          limbs: [{ kind: 'leg', count: 4, size: 0.6, placement: 'mixed', gaitStyle: 0.5 }],
          appendages: [{ kind: 'tail', size: 0.5, split: 0 }],
        },
      },
      mass: 8,
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      energy: 0,
      fatStore: 0,
      age: 2,
      mode: 'patrol',
      mood: { stress: 0.2, focus: 0.5, social: 0.5 },
      target: null,
      escapeCooldown: 0,
      gestationTimer: 0,
      injuries: 0,
      libido: 0,
      sexCooldown: 0,
    },
  ],
  plants: [
    {
      id: 1,
      dna: {
        biomass: 0.4,
        regrowthRate: 0.3,
        seedSpread: 0.5,
        pigment: '#2ab811',
        nutrientDensity: 0.8,
        thorns: 0,
        seasonPreference: 0,
      },
      position: { x: 100, y: 100 },
      size: 0.4,
      moisture: 0.7,
    },
  ],
  corpses: [],
  manures: [],
  fertilizers: [],
  stats: { totalBirths: 0, totalDeaths: 0, mutations: 0, averageFitness: 0 },
}

const world = createWorldFromSnapshot(snapshot)
const agentEntity = world.agents.get(1)
if (agentEntity === undefined) throw new Error('Missing agent entity')
const plantEntity = world.plants.get(1)
if (plantEntity === undefined) throw new Error('Missing plant entity')

applyFoodIntake(world, agentEntity, 1, 3_000)
manureSystem(world, 0.1)

if (world.manures.size !== 1) {
  throw new Error(`Expected 1 manure pile, got ${world.manures.size}`)
}

const manureEntity = world.manures.values().next().value as number
const mass = snapshot.agents[0].mass ?? snapshot.agents[0].dna.bodyMass
const expectedDecay = clamp((120 + mass * 18) / 10, 6, 180)
if (Math.abs(Manure.maxDecay[manureEntity] - expectedDecay) > 0.001) {
  throw new Error(`Unexpected manure decay: got=${Manure.maxDecay[manureEntity]} expected=${expectedDecay}`)
}
const manureRadiusBefore = Manure.radius[manureEntity] || 0

// Advance enough time for manure to dissolve into a persistent fertilizer patch.
manureSystem(world, Manure.decay[manureEntity] + 0.5)
if (world.manures.size !== 0) {
  throw new Error('Expected manure pile to dissolve after decay')
}

if (world.fertilizers.size !== 1) {
  throw new Error(`Expected 1 fertilizer patch, got ${world.fertilizers.size}`)
}
const fertilizerId = world.fertilizers.keys().next().value as number
const fertilizerEntity = world.fertilizers.get(fertilizerId)
if (fertilizerEntity === undefined) throw new Error('Missing fertilizer entity')
if (!Number.isFinite(Fertilizer.nutrients[fertilizerEntity]) || Fertilizer.nutrients[fertilizerEntity] <= 0) {
  throw new Error('Expected fertilizer patch to have nutrients')
}
const expectedRadius = manureRadiusBefore * 4
if (!(Fertilizer.radius[fertilizerEntity] >= expectedRadius - 0.001)) {
  throw new Error(`Expected fertilizer radius to scale from manure (got=${Fertilizer.radius[fertilizerEntity]} expected>=${expectedRadius})`)
}
const fertilizerBefore = Fertilizer.nutrients[fertilizerEntity]

// Fertilizer should accelerate plant growth and be consumed as plants grow.
const baseline = createWorldFromSnapshot(snapshot)
const baselinePlantEntity = baseline.plants.get(1)
if (baselinePlantEntity === undefined) throw new Error('Missing baseline plant entity')

plantGrowthSystem(baseline, 5)
plantGrowthSystem(world, 5)

const acceleratedGrowth = PlantStats.biomass[plantEntity]
const baselineGrowth = PlantStats.biomass[baselinePlantEntity]
if (!(acceleratedGrowth > baselineGrowth)) {
  throw new Error(`Expected fertilizer to accelerate growth (fert=${acceleratedGrowth} base=${baselineGrowth})`)
}
const fertilizerAfterEntity = world.fertilizers.get(fertilizerId)
const fertilizerAfter = fertilizerAfterEntity === undefined ? 0 : Fertilizer.nutrients[fertilizerAfterEntity]
if (!(fertilizerAfter < fertilizerBefore)) {
  throw new Error(`Expected fertilizer nutrients to be consumed (before=${fertilizerBefore} after=${fertilizerAfter})`)
}

console.log('manure system fertilization test passed')
