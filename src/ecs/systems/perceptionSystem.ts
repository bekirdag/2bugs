import { AgentMeta, DNA, Energy, ModeState, Mood, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'
import type { ControlState } from '@/types/sim'
import { clamp, distanceSquared } from '@/utils/math'

const MODE = {
  Sleep: 1,
  Graze: 2,
  Hunt: 3,
  Flee: 4,
  Mate: 5,
  Patrol: 6,
} as const

export function perceptionSystem(ctx: SimulationContext, controls: ControlState) {
  ctx.agents.forEach((entity, id) => {
    if (ModeState.mode[entity] === MODE.Mate) return

    const energy = Energy.value[entity]
    const hungerThreshold = Energy.value[entity]
    const hungerRatio = energy / Math.max(hungerThreshold, 1)
    const hungry = hungerRatio < 1
    const famished = hungerRatio < 0.55
    const stress = Mood.stress[entity]
    const focus = Mood.focus[entity]
    const aggression = clamp((DNA.aggression[entity] ?? 0.4) + (controls.aggressionBias ?? 0), 0, 1)
    const awareness = clamp((DNA.awareness[entity] ?? 0.5) + (controls.curiosityBias ?? 0) * 0.5, 0.05, 1)
    const archetype = decodeArchetype(AgentMeta.archetype[entity])
    const dietAgents = archetypeDiet(archetype)
    const eatsPlants = dietAgents.includes('plant')

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const vision = DNA.visionRange[entity] * (1 + (awareness - 0.5) * 0.6)
    const neighbors = ctx.agentIndex.query(mePos, vision)

    let closestPredator: Candidate | null = null
    let bestPrey: Candidate | null = null

    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      const otherType = decodeArchetype(AgentMeta.archetype[otherEntity])
      const otherPos = { x: Position.x[otherEntity], y: Position.y[otherEntity] }
      const dist = Math.sqrt(distanceSquared(mePos, otherPos))
      const isPredator = archetypeDiet(otherType).includes(archetype)
      if (isPredator) {
          if (!closestPredator || dist < closestPredator.distance) {
            closestPredator = { entity: otherEntity, distance: dist }
          }
      }
      if (dietAgents.includes(otherType) && hungry) {
        const weight =
          (1 / Math.max(dist, 1)) * (0.6 + focus * 0.4) * (1 + aggression * 0.4) * awareness
        if (!bestPrey || weight > bestPrey.weight!) {
          bestPrey = { entity: otherEntity, distance: dist, weight }
        }
      }
    })

    if (closestPredator) {
      ModeState.mode[entity] = MODE.Flee
      ModeState.targetType[entity] = 1
      ModeState.targetId[entity] = AgentMeta.id[closestPredator.entity]
      ModeState.dangerTimer[entity] = 1
      return
    }

    const stability = DNA.moodStability[entity] ?? 0.5
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
    const huntDrive = hungry
      ? 0.6 + focus * 0.3 + (DNA.stamina[entity] ?? 1) * 0.1 + curiosity * 0.2
      : aggression * 0.35 + focus * 0.2 - stress * (0.2 + (1 - stability) * 0.2)
    if (huntDrive > 0.35 && bestPrey) {
      ModeState.mode[entity] = MODE.Hunt
      ModeState.targetType[entity] = 1
      ModeState.targetId[entity] = AgentMeta.id[bestPrey.entity]
      return
    }

    if ((hungry || famished) && eatsPlants) {
      const plantCandidates = ctx.plantIndex.query(mePos, vision)
      let bestPlant: PlantCandidate | null = null
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dist = Math.sqrt(distanceSquared(mePos, plantPos))
        const weight =
          (Energy.fatCapacity[entity] * 0.2 + 1) * (1 / Math.max(dist, 1)) * (famished ? 1.2 : 1)
        if (!bestPlant || weight > bestPlant.weight!) {
          bestPlant = { id: bucket.id, entity: plantEntity, distance: dist, weight }
        }
      })
      if (bestPlant) {
        ModeState.mode[entity] = MODE.Graze
        ModeState.targetType[entity] = 2
        ModeState.targetId[entity] = bestPlant.id
        return
      }
    }

    ModeState.targetType[entity] = 0
    ModeState.targetId[entity] = 0
  })
}

type Candidate = {
  entity: number
  distance: number
  weight?: number
}

type PlantCandidate = Candidate & { id: number }

function decodeArchetype(code: number): 'hunter' | 'prey' | 'scavenger' {
  switch (code) {
    case ArchetypeCode.Hunter:
      return 'hunter'
    case ArchetypeCode.Scavenger:
      return 'scavenger'
    default:
      return 'prey'
  }
}

function archetypeDiet(archetype: string) {
  if (archetype === 'hunter') return ['prey']
  if (archetype === 'scavenger') return ['prey', 'plant']
  return ['plant']
}
