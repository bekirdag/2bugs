import {
  AgentMeta,
  DNA,
  Energy,
  ModeState,
  Mood,
  Position,
  ArchetypeCode,
  Reproduction,
} from '../components'
import { applyBehaviourIntent } from '../mood/behaviorEngine'
import { resolveMood, type MoodMachineInput } from '../mood/moodMachine'
import { decodeMoodKind, encodeMoodKind, encodeMoodTier } from '../mood/moodCatalog'
import type { SimulationContext } from '../types'
import type { ControlState, TargetRef } from '@/types/sim'
import { clamp, distanceSquared } from '@/utils/math'

const ModeCode = {
  Mate: 5,
} as const

export function perceptionSystem(ctx: SimulationContext, controls: ControlState) {
  const tick = ctx.tick
  // Run perception every other tick to reduce load
  if (tick % 2 === 1) return

  ctx.agents.forEach((entity, id) => {
    const currentMode = ModeState.mode[entity]
    const genome = ctx.genomes.get(id)

    const stress = Mood.stress[entity]
    const focus = Mood.focus[entity]
    const hungerLine = Energy.metabolism[entity] * 12 + Energy.sleepDebt[entity]
    const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 1)
    const fatigue = clamp(Mood.fatigue[entity], 0, 1)
    const sleepPressure = clamp(Energy.sleepDebt[entity] / 5, 0, 1)
    const libidoRatio = clamp(
      Reproduction.libido[entity] / Math.max(Reproduction.libidoThreshold[entity] || 0.6, 0.1),
      0,
      1,
    )
    const aggression = clamp((DNA.aggression[entity] ?? 0.4) + (controls.aggressionBias ?? 0), 0, 1)
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
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

    let threatLevel = 0
    let predatorTarget: TargetRef | null = null
    let closestPredatorDist = Infinity
    let bestPreyTarget: TargetRef | null = null
    let bestPreyWeight = -Infinity
    let allyCount = 0
    let allyProximity = 0

    const dangerRadius = genome?.dangerRadius ?? vision
    const escapeTendency = clamp(
      genome?.escapeTendency ?? DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3,
      0.01,
      2,
    )
    const awarenessGene = genome?.awareness ?? DNA.awareness[entity] ?? 0.5
    const courageGene = genome?.bravery ?? 0.5
    let forcedFlee = false
    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      const otherType = decodeArchetype(AgentMeta.archetype[otherEntity])
      const otherPos = { x: Position.x[otherEntity], y: Position.y[otherEntity] }
      const dist = Math.sqrt(distanceSquared(mePos, otherPos))
      if (dist > vision) return

      const sameSpecies = otherType === archetype
      const sameFamily = AgentMeta.familyColor[otherEntity] === AgentMeta.familyColor[entity]
      if (sameSpecies) {
        allyCount += 1
        allyProximity += clamp(1 - dist / vision, 0, 1)
      }
      const sizeRatio =
        Energy.fatCapacity[otherEntity] / Math.max(Energy.fatCapacity[entity] || 1, 1)
      const sizeFactor = clamp(sizeRatio - 1, -0.5, 2) * sizeFear

      let threatBase = speciesFear
      if (otherType === 'hunter' && archetype !== 'hunter') {
        threatBase += DNA.fear[entity] ?? 0.3
      } else if (!sameSpecies) {
        threatBase += speciesFear
      } else if (!sameFamily) {
        threatBase += conspecificFear
      }

      const cowardice = clamp(DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3, 0, 2)
      const proximity = clamp(1 - dist / vision, 0, 1)
      const threatScore = clamp(
        (threatBase + cowardice) * (proximity + awarenessGene) * (1 + sizeFactor),
        0,
        5,
      )

      if (threatScore > threatLevel && dist < closestPredatorDist) {
        closestPredatorDist = dist
        threatLevel = threatScore
        predatorTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
        // Immediate reflex: if threat is pronounced, trigger flee right now
        if (threatScore > escapeTendency && dist <= dangerRadius) {
          ModeState.mode[entity] = 4 // Flee
          ModeState.targetType[entity] = 1
          ModeState.targetId[entity] = predatorTarget.id
          ModeState.dangerTimer[entity] = Math.max(
            ModeState.dangerTimer[entity],
            dangerRadius / Math.max(DNA.baseSpeed[entity], 1),
          )
          forcedFlee = true
        }
      }

      if (dietAgents.includes(otherType) && hungerRatio < 1.1) {
        const weight =
          (1 / Math.max(dist, 1)) * (0.6 + focus * 0.4) * (1 + aggression * 0.4) * awareness
        if (weight > bestPreyWeight) {
          bestPreyWeight = weight
          bestPreyTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
        }
      }
    })
    if (forcedFlee) {
      return
    }

    // Primitive flight reflex: override any ongoing behaviour if predator is close enough
    const fear = DNA.fear[entity] ?? 0.3
    const fleeTrigger = dangerRadius * clamp((awarenessGene + fear + courageGene) / 3, 0.1, 2)
    if (predatorTarget && closestPredatorDist <= fleeTrigger) {
      threatLevel = Math.max(threatLevel, escapeTendency)
    }

    let bestPlantTarget: TargetRef | null = null
    if (eatsPlants && (hungerRatio < 0.9 || hungerRatio < 1 && bestPreyTarget === null)) {
      const plantCandidates = ctx.plantIndex.query(mePos, vision)
      let bestPlantWeight = -Infinity
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dist = Math.sqrt(distanceSquared(mePos, plantPos))
        const weight =
          (Energy.fatCapacity[entity] * 0.2 + 1) * (1 / Math.max(dist, 1)) * (hungerRatio < 0.55 ? 1.2 : 1)
        if (weight > bestPlantWeight) {
          bestPlantWeight = weight
          bestPlantTarget = { kind: 'plant', id: bucket.id }
        }
      })
    }

    const socialCohesion = allyCount === 0 ? 0 : clamp(allyProximity / allyCount, 0, 1)
    const moodInput: MoodMachineInput = {
      hungerRatio,
      fatigue,
      sleepPressure,
      libido: libidoRatio,
      threatLevel: clamp(threatLevel, 0, 1),
      socialCohesion,
      curiosity,
      aggression,
      fear: DNA.fear[entity] ?? 0.3,
      cowardice: DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3,
      cohesion: DNA.socialDrive[entity] ?? 0.2,
      dependency: genome?.dependency ?? 0,
      moodStability: DNA.moodStability[entity] ?? 0.5,
      stress,
      currentMood: decodeMoodKind(Mood.state[entity]),
      predatorTarget,
      preyTarget: bestPreyTarget,
      plantTarget: bestPlantTarget,
    }

    const decision = resolveMood(moodInput)

    if (predatorTarget && closestPredatorDist <= fleeTrigger) {
      decision.behaviour.mode = 'flee'
      decision.behaviour.target = predatorTarget
      ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], 1.25)
    }

    // Align behaviour with explicit search targets by mood
    if (decision.behaviour.mode === 'hunt' && bestPreyTarget) {
      decision.behaviour.target = bestPreyTarget
    } else if (decision.behaviour.mode === 'graze' && bestPlantTarget) {
      decision.behaviour.target = bestPlantTarget
    } else if (decision.behaviour.mode === 'mate') {
      decision.behaviour.target = findMateTarget(ctx, entity, id, neighbors)
    } else if (decision.behaviour.mode === 'patrol') {
      decision.behaviour.target = preferForageTarget(bestPreyTarget, bestPlantTarget)
    } else if (decision.behaviour.mode === 'fight') {
      decision.behaviour.target = predatorTarget ?? decision.behaviour.target ?? bestPreyTarget
    }

    applyBehaviourIntent(entity, decision.behaviour)

    if (decision.tier === 'survival') {
      ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], decision.intensity + 0.5)
    } else if (ModeState.dangerTimer[entity] > 0) {
      ModeState.dangerTimer[entity] = Math.max(0, ModeState.dangerTimer[entity] - 0.05)
    }

    Mood.state[entity] = encodeMoodKind(decision.mood)
    Mood.tier[entity] = encodeMoodTier(decision.tier)
    Mood.intensity[entity] = decision.intensity
    if (decision.tier === 'survival') {
      Mood.stress[entity] = clamp(Mood.stress[entity] + decision.intensity * 0.35, 0, 1)
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.15, 0, 1)
    } else {
      Mood.stress[entity] = clamp(Mood.stress[entity] * 0.97, 0, 1)
    }
    if (decision.behaviour.mode === 'hunt' || decision.behaviour.mode === 'graze') {
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.1, 0, 1)
    } else if (decision.behaviour.mode === 'sleep') {
      Mood.focus[entity] = clamp(Mood.focus[entity] * 0.92, 0, 1)
    }
    Mood.social[entity] = clamp(
      Mood.social[entity] + (decision.mood === 'bonding' ? 0.08 : (ctx.rng() - 0.5) * 0.015),
      0,
      1,
    )
  })
}

function findMateTarget(
  ctx: SimulationContext,
  entity: number,
  entityId: number,
  neighbors: ReturnType<SimulationContext['agentIndex']['query']>,
): TargetRef | null {
  const libido = Reproduction.libido[entity]
  const libidoThreshold = Reproduction.libidoThreshold[entity] || 0.6
  if (libido < libidoThreshold) return null
  let best: { id: number; dist: number } | null = null
  neighbors.forEach((bucket) => {
    if (bucket.id === entityId) return
    const mateEntity = ctx.agents.get(bucket.id)
    if (mateEntity === undefined) return
    if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) return
    if (ModeState.sexCooldown[mateEntity] > 0) return
    if (Reproduction.libido[mateEntity] < (Reproduction.libidoThreshold[mateEntity] || 0.6)) return
    const dx = Position.x[entity] - Position.x[mateEntity]
    const dy = Position.y[entity] - Position.y[mateEntity]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (!best || dist < best.dist) {
      best = { id: bucket.id, dist }
    }
  })
  return best ? { kind: 'agent', id: best.id } : null
}

function preferForageTarget(prey: TargetRef | null | undefined, plant: TargetRef | null | undefined) {
  if (plant && !prey) return plant
  if (prey && !plant) return prey
  return plant ?? prey ?? null
}

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
