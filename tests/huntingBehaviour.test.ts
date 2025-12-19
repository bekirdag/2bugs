import { createWorldFromSnapshot, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type SimulationSnapshot } from '../src/types/sim'

const snapshot: SimulationSnapshot = {
  version: 1,
  config: { ...DEFAULT_WORLD_CONFIG, rngSeed: 123, maxAgents: 0, maxPlants: 0 },
  tick: 0,
  agents: [
    {
      id: 1,
      dna: {
        archetype: 'hunter',
        biome: 'land',
        familyColor: '#ff0000',
        baseSpeed: 320,
        visionRange: 260,
        hungerThreshold: 60,
        forageStartRatio: 0.8,
        eatingGreed: 0.6,
        fatCapacity: 900,
        fatBurnThreshold: 300,
        patrolThreshold: 40,
        aggression: 0.7,
        bravery: 0.6,
        power: 90,
        defence: 60,
        fightPersistence: 0.5,
        escapeTendency: 0.4,
        escapeDuration: 2,
        lingerRate: 0.5,
        dangerRadius: 140,
        attentionSpan: 0.6,
        libidoThreshold: 0.6,
        libidoGainRate: 0.05,
        mutationRate: 0.01,
        bodyMass: 10,
        metabolism: 8,
        turnRate: 1.5,
        curiosity: 0.4,
        cohesion: 0.3,
        fear: 0.3,
        cowardice: 0.3,
        speciesFear: 0.3,
        conspecificFear: 0.2,
        sizeFear: 0.4,
        preySizeTargetRatio: 0.6,
        dependency: 0.2,
        independenceAge: 20,
        camo: 0.2,
        awareness: 0.85,
        fertility: 0.4,
        gestationCost: 10,
        moodStability: 0.6,
        preferredFood: ['prey'],
        stamina: 1,
        circadianBias: 0,
        sleepEfficiency: 0.8,
        scavengerAffinity: 0,
        senseUpkeep: 0,
        bodyPlanVersion: 1,
        bodyPlan: {
          chassis: { length: 0.6, depth: 0.6, massBias: 0.6, flexibility: 0.5, plating: 0.4 },
          senses: [
            { sense: 'eye', count: 2, distribution: 'head', acuity: 0.8, layout: { placements: [{ x: 0.45, y: -0.22, angle: 0 }, { x: 0.45, y: 0.22, angle: 0 }] } },
            { sense: 'ear', count: 2, distribution: 'head', acuity: 0.7, layout: { placements: [{ x: 0.35, y: -0.35, angle: 0 }, { x: 0.35, y: 0.35, angle: 0 }] } },
            { sense: 'nose', count: 1, distribution: 'head', acuity: 0.6, layout: { placements: [{ x: 0.52, y: 0, angle: 0 }] } },
          ],
          limbs: [{ kind: 'leg', count: 4, size: 0.6, placement: 'mixed', gaitStyle: 0.5 }],
          appendages: [{ kind: 'tail', size: 0.5, split: 0 }],
        },
      },
      mass: 10,
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      // Hungry enough that mood should switch to hunt.
      energy: 50,
      fatStore: 0,
      age: 10,
      mode: 'patrol',
      mood: { stress: 0.2, focus: 0.5, social: 0.5 },
      target: null,
      escapeCooldown: 0,
      gestationTimer: 0,
      injuries: 0,
      libido: 0,
      sexCooldown: 0,
    },
    {
      id: 2,
      dna: {
        archetype: 'prey',
        biome: 'land',
        familyColor: '#00aaff',
        baseSpeed: 220,
        visionRange: 220,
        hungerThreshold: 60,
        forageStartRatio: 0.7,
        eatingGreed: 0.5,
        fatCapacity: 600,
        fatBurnThreshold: 200,
        patrolThreshold: 40,
        aggression: 0.2,
        bravery: 0.4,
        power: 30,
        defence: 40,
        fightPersistence: 0.3,
        escapeTendency: 0.7,
        escapeDuration: 2,
        lingerRate: 0.5,
        dangerRadius: 140,
        attentionSpan: 0.6,
        libidoThreshold: 0.6,
        libidoGainRate: 0.05,
        mutationRate: 0.01,
        bodyMass: 1,
        metabolism: 8,
        turnRate: 1.5,
        curiosity: 0.4,
        cohesion: 0.3,
        fear: 0.6,
        cowardice: 0.7,
        speciesFear: 0.7,
        conspecificFear: 0.2,
        sizeFear: 0.7,
        preySizeTargetRatio: 0.9,
        dependency: 0.2,
        independenceAge: 20,
        camo: 0.2,
        awareness: 0.65,
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
          // Keep prey stationary so the test validates hunting/attack logic, not chase dynamics.
          limbs: [{ kind: 'leg', count: 0, size: 0.6, placement: 'mixed', gaitStyle: 0.5 }],
          appendages: [{ kind: 'tail', size: 0.4, split: 0 }],
        },
      },
      mass: 1,
      // Place prey within guaranteed detection range (dist <= 12).
      position: { x: 110, y: 100 },
      velocity: { x: 0, y: 0 },
      heading: Math.PI,
      energy: 20,
      fatStore: 0,
      age: 10,
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
  plants: [],
  corpses: [],
  stats: { totalBirths: 0, totalDeaths: 0, mutations: 0, averageFitness: 0 },
}

const world = createWorldFromSnapshot(snapshot)
const controls = { ...DEFAULT_CONTROLS, maxAgents: 0, maxPlants: 0 }

// Tick 0: perception chooses prey, sets hunt intent, commit applies mode/target, interaction resolves duel.
stepWorld(world, DEFAULT_WORLD_CONFIG.timeStepMs, controls)
// Tick 1: commit intent from duel sets target corpse (if created).
stepWorld(world, DEFAULT_WORLD_CONFIG.timeStepMs, controls)

const after = snapshotWorld(world)

if (after.agents.some((a) => a.id === 2)) {
  const hunter = after.agents.find((a) => a.id === 1)
  const prey = after.agents.find((a) => a.id === 2)
  const dx = hunter && prey ? hunter.position.x - prey.position.x : NaN
  const dy = hunter && prey ? hunter.position.y - prey.position.y : NaN
  const dist = hunter && prey ? Math.sqrt(dx * dx + dy * dy) : NaN
  throw new Error(
    `Expected prey (id=2) to be killed (hunterMode=${hunter?.mode} hunterTarget=${hunter?.target?.kind ?? 'none'}:${hunter?.target?.id ?? 0} dist=${dist})`,
  )
}
if (after.corpses.length === 0) {
  throw new Error('Expected a corpse to be created from the killed prey')
}
const hunter = after.agents.find((a) => a.id === 1)
if (!hunter) throw new Error('Missing hunter after simulation')
if (hunter.mode !== 'hunt') {
  throw new Error(`Expected hunter to be in hunt mode (got ${hunter.mode})`)
}

console.log('hunting behaviour test passed')
