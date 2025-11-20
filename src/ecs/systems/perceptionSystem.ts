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
  const tick = ctx.tick
  // Run perception every other tick to reduce load
  if (tick % 2 === 1) return

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
    const speciesFear = clamp(DNA.speciesFear[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
    const conspecificFear = clamp(DNA.conspecificFear[entity] ?? 0.25, 0, 1)
    const sizeFear = clamp(DNA.sizeFear[entity] ?? 0.5, 0, 1)

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const vision = DNA.visionRange[entity] * (1 + (awareness - 0.5) * 0.6)
    const neighbors = ctx.agentIndex.query(mePos, vision)

    let closestPredatorId: number | null = null
    let closestPredatorDist = Infinity
    let closestPredatorType: 'hunter' | 'other' | null = null
    let bestPreyId: number | null = null
    let bestPreyWeight = -Infinity

    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      const otherType = decodeArchetype(AgentMeta.archetype[otherEntity])
      const otherPos = { x: Position.x[otherEntity], y: Position.y[otherEntity] }
      const dist = Math.sqrt(distanceSquared(mePos, otherPos))
      const senseRange = vision
      if (dist > senseRange) return

      const sameSpecies = otherType === archetype
      const sameFamily = AgentMeta.familyColor[otherEntity] === AgentMeta.familyColor[entity]
      const sizeRatio =
        Energy.fatCapacity[otherEntity] / Math.max(Energy.fatCapacity[entity] || 1, 1)
      const sizeFactor = clamp(sizeRatio - 1, -0.5, 2) * sizeFear

      let threatBase = 0
      if (otherType === 'hunter' && archetype !== 'hunter') {
        threatBase = 1.2 + speciesFear * 0.6
      } else if (!sameSpecies) {
        threatBase = 0.6 + speciesFear * 0.6
      } else if (!sameFamily) {
        threatBase = 0.3 + conspecificFear * 0.8
      } else {
        threatBase = 0.1
      }

      const cowardice = clamp(DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
      const proximity = clamp(1 - dist / senseRange, 0, 1)
      const threatScore = threatBase * (0.6 + cowardice * 0.7) * (1 + sizeFactor) * (0.4 + proximity)

      if (threatScore > 0.35 && dist < closestPredatorDist) {
        closestPredatorId = AgentMeta.id[otherEntity]
        closestPredatorDist = dist
        closestPredatorType = otherType === 'hunter' ? 'hunter' : 'other'
      }
      if (dietAgents.includes(otherType) && hungry) {
        const weight =
          (1 / Math.max(dist, 1)) * (0.6 + focus * 0.4) * (1 + aggression * 0.4) * awareness
        if (weight > bestPreyWeight) {
          bestPreyWeight = weight
          bestPreyId = AgentMeta.id[otherEntity]
        }
      }
    })

    if (closestPredatorId !== null) {
      const cowardice = clamp(DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
      const fleeThreshold = vision * (0.2 + cowardice * 0.7) * (closestPredatorType === 'hunter' ? 1 : 0.85)
      if (closestPredatorDist <= fleeThreshold) {
        ModeState.mode[entity] = MODE.Flee
        ModeState.targetType[entity] = 1
        ModeState.targetId[entity] = closestPredatorId
        ModeState.dangerTimer[entity] = 1
        return
      }
    }

    const stability = DNA.moodStability[entity] ?? 0.5
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
    const huntDrive = hungry
      ? 0.6 + focus * 0.3 + (DNA.stamina[entity] ?? 1) * 0.1 + curiosity * 0.2
      : aggression * 0.35 + focus * 0.2 - stress * (0.2 + (1 - stability) * 0.2)
    if (huntDrive > 0.35 && bestPreyId !== null) {
      ModeState.mode[entity] = MODE.Hunt
      ModeState.targetType[entity] = 1
      ModeState.targetId[entity] = bestPreyId
      return
    }

    if ((hungry || famished) && eatsPlants) {
      const plantCandidates = ctx.plantIndex.query(mePos, vision)
      let bestPlantId: number | null = null
      let bestPlantWeight = -Infinity
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dist = Math.sqrt(distanceSquared(mePos, plantPos))
        const weight =
          (Energy.fatCapacity[entity] * 0.2 + 1) * (1 / Math.max(dist, 1)) * (famished ? 1.2 : 1)
        if (weight > bestPlantWeight) {
          bestPlantWeight = weight
          bestPlantId = bucket.id
        }
      })
      if (bestPlantId !== null) {
        ModeState.mode[entity] = MODE.Graze
        ModeState.targetType[entity] = 2
        ModeState.targetId[entity] = bestPlantId
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
