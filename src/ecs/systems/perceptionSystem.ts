import {
  AgentMeta,
  Body,
  Corpse,
  DNA,
  Energy,
  Heading,
  Intent,
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

function computeVisionFovRadians(archetype: string, awarenessGene: number) {
  // Animals tend to have a limited forward field-of-view; prey generally have wider peripheral vision.
  const base = archetype === 'hunter' ? (220 * Math.PI) / 180 : (260 * Math.PI) / 180
  return clamp(base * (0.75 + clamp(awarenessGene, 0, 1) * 0.5), Math.PI * 0.6, Math.PI * 2)
}

function detectionChance(
  headingCos: number,
  headingSin: number,
  dx: number,
  dy: number,
  dist: number,
  maxDist: number,
  awarenessGene: number,
  targetCamo: number,
  cosHalfFov: number,
) {
  // Within a very small radius, assume detection (touch/hearing).
  if (dist <= 18) return 1

  // Use dot products instead of atan2/angle wrapping:
  // dot = cos(angleDiff) in [-1, 1]
  const inv = 1 / Math.max(dist, 0.001)
  const dirX = dx * inv
  const dirY = dy * inv
  const dot = dirX * headingCos + dirY * headingSin
  const denom = cosHalfFov + 1
  const peripheral = denom <= 0.0001 ? 0 : clamp((dot + 1) / denom, 0, 1) * 0.25
  const fovFactor = dot >= cosHalfFov ? 1 : peripheral

  const distFactor = clamp(1 - dist / Math.max(maxDist, 1), 0, 1)
  const awarenessFactor = clamp(0.65 + awarenessGene * 0.7, 0.4, 1.35)
  const camoFactor = clamp(1 - clamp(targetCamo, 0, 1) * 0.6, 0.2, 1)

  return clamp((0.1 + distFactor * 0.9) * fovFactor * awarenessFactor * camoFactor, 0, 1)
}

function approximateBodyMass(ctx: SimulationContext, id: number, entity: number) {
  const current = Body.mass[entity]
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) return current
  const genome = ctx.genomes.get(id)
  const m = genome?.bodyMass
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m
  const fallback = (Energy.fatCapacity[entity] || 120) / 120
  return Math.max(0.3, fallback)
}

export function perceptionSystem(ctx: SimulationContext, controls: ControlState) {
  const tick = ctx.tick
  // Run perception every other tick to reduce load
  if (tick % 2 === 1) return

  ctx.agents.forEach((entity, id) => {
    const genome = ctx.genomes.get(id)
    const escapeDuration = clamp(genome?.escapeDuration ?? 2, 0.5, 12)
    const lingerRate = clamp(genome?.lingerRate ?? 0.5, 0, 1)
    const attentionSpan = clamp(genome?.attentionSpan ?? 0.5, 0.1, 2)

    const stress = Mood.stress[entity]
    const focus = Mood.focus[entity]
    const hungerThreshold = (genome?.hungerThreshold ?? Energy.metabolism[entity] * 8) * 1.5
    const hungerLine = hungerThreshold + Energy.sleepDebt[entity]
    const hungerRatio = clamp(Energy.value[entity] / Math.max(hungerLine, 1), 0, 1)
    const fatigue = clamp(Mood.fatigue[entity], 0, 1)
    const sleepPressure = clamp(Energy.sleepDebt[entity] / 5, 0, 1)
    const inReproCooldown = ModeState.sexCooldown[entity] > 0 || ctx.pregnancies.has(id)
    const libidoRatio = inReproCooldown
      ? 0
      : clamp(
          Reproduction.libido[entity] / Math.max(Reproduction.libidoThreshold[entity] || 0.6, 0.1),
          0,
          1,
        )
    const aggression = clamp((DNA.aggression[entity] ?? 0.4) + (controls.aggressionBias ?? 0), 0, 1)
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
    const awareness = clamp((DNA.awareness[entity] ?? 0.5) + (controls.curiosityBias ?? 0) * 0.5, 0.05, 1)
    const archetype = decodeArchetype(AgentMeta.archetype[entity])
    const preferredFood =
      genome?.preferredFood && genome.preferredFood.length ? genome.preferredFood : archetypeDiet(archetype)
    const eatsPlants = preferredFood.includes('plant')
    const dietAgents = preferredFood.filter((type) => type !== 'plant')
    const speciesFear = clamp(DNA.speciesFear[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
    const conspecificFear = clamp(DNA.conspecificFear[entity] ?? 0.25, 0, 1)
    const sizeFear = clamp(DNA.sizeFear[entity] ?? 0.5, 0, 1)

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const vision = DNA.visionRange[entity] * (1 + (awareness - 0.5) * 0.6)
    const neighbors = ctx.agentIndex.query(mePos, vision)

    const myBodyMass = approximateBodyMass(ctx, id, entity)
    const preySizeTargetRatio =
      archetype === 'hunter' ? clamp(genome?.preySizeTargetRatio ?? 0.6, 0.05, 1.5) : 1

    let threatLevel = 0
    let predatorTarget: TargetRef | null = null
    let closestPredatorDist = Infinity
    let bestPreyTarget: TargetRef | null = null
    let bestPreyWeight = -Infinity
    let bestCarrionTarget: TargetRef | null = null
    let bestCarrionWeight = -Infinity
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
    const fovRadians = computeVisionFovRadians(archetype, awarenessGene)
    const cosHalfFov = Math.cos(fovRadians / 2)
    const heading = Heading.angle[entity]
    const headingCos = Math.cos(heading)
    const headingSin = Math.sin(heading)
    let forcedFlee = false
    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      const otherType = decodeArchetype(AgentMeta.archetype[otherEntity])
      const otherPos = { x: Position.x[otherEntity], y: Position.y[otherEntity] }
      const dx = otherPos.x - mePos.x
      const dy = otherPos.y - mePos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > vision) return
      const seenChance = detectionChance(
        headingCos,
        headingSin,
        dx,
        dy,
        dist,
        vision,
        awarenessGene,
        DNA.camo[otherEntity] ?? 0,
        cosHalfFov,
      )
      if (ctx.rng() > seenChance) return

      const sameSpecies = otherType === archetype
      const sameFamily = AgentMeta.familyColor[otherEntity] === AgentMeta.familyColor[entity]
      if (sameSpecies) {
        allyCount += 1
        allyProximity += clamp(1 - dist / vision, 0, 1)
      }
      // Do not treat same-family conspecifics as threats; they are baseline allies.
      if (sameSpecies && sameFamily) {
        return
      }
      const otherMass = approximateBodyMass(ctx, bucket.id, otherEntity)
      const sizeRatio = otherMass / Math.max(myBodyMass, 0.001)
      // `sizeFear` is the sensitivity to size differences. Larger opponents are scarier; much smaller ones are discounted.
      const sizeDelta = clamp(sizeRatio - 1, -0.95, 3)
      const sizeMultiplier = clamp(1 + sizeDelta * sizeFear, 0.05, 3)

      // Threat heuristics:
      // - Same family: treat as safe/ally by default (no automatic fear response).
      // - Same species but different family: mild conspecific wariness.
      // - Different species: apply species fear; prey get extra predator fear from hunters.
      let threatBase = 0
      if (!sameSpecies) {
        threatBase = speciesFear
        if (otherType === 'hunter' && archetype !== 'hunter') {
          // If the "predator" is much smaller than us, we should not overreact.
          const predatorScale = clamp((sizeRatio - 0.6) / 0.6, 0, 1)
          threatBase += (DNA.fear[entity] ?? 0.3) * predatorScale
        }
      } else if (!sameFamily) {
        threatBase = conspecificFear
      }

      const cowardice = clamp(DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3, 0, 2)
      const proximity = clamp(1 - dist / vision, 0, 1)
      const threatScore = clamp(
        (threatBase + cowardice) * (proximity + awarenessGene) * sizeMultiplier,
        0,
        5,
      )

      if (threatScore > threatLevel && dist < closestPredatorDist) {
        closestPredatorDist = dist
        threatLevel = threatScore
        predatorTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
        // Immediate reflex: if threat is pronounced, trigger flee right now
        if (threatScore > escapeTendency && dist <= dangerRadius) {
          Intent.mode[entity] = 4 // Flee
          Intent.targetType[entity] = 1
          Intent.targetId[entity] = predatorTarget.id
          ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], escapeDuration)
          ModeState.dangerTimer[entity] = Math.max(
            ModeState.dangerTimer[entity],
            dangerRadius / Math.max(DNA.baseSpeed[entity], 1),
          )
          forcedFlee = true
        }
      }

      if (dietAgents.includes(otherType) && hungerRatio < 1.1) {
        const baseWeight =
          (1 / Math.max(dist, 1)) * (0.6 + focus * 0.4) * (1 + aggression * 0.4) * awareness
        let sizeBias = 1
        if (archetype === 'hunter' && otherType === 'prey') {
          const preyMass = approximateBodyMass(ctx, bucket.id, otherEntity)
          const ratio = preyMass / Math.max(myBodyMass, 0.001)
          const band = clamp(preySizeTargetRatio * 0.8 + 0.15, 0.15, 1.5)
          sizeBias = clamp(1 - Math.abs(ratio - preySizeTargetRatio) / band, 0.05, 1.15)
          // Strongly penalize taking on prey larger than self.
          if (ratio > 1) sizeBias *= clamp(1 / ratio, 0.05, 1)
        }
        const weight = baseWeight * sizeBias
        if (weight > bestPreyWeight) {
          bestPreyWeight = weight
          bestPreyTarget = { kind: 'agent', id: AgentMeta.id[otherEntity] }
        }
      }
    })
    if (forcedFlee) {
      return
    }

    // Target stickiness: `lingerRate` makes agents less likely to thrash targets when weights are close.
    const stickiness = (1 + lingerRate * 0.75) * (1 + attentionSpan * 0.4)
    if (ModeState.targetType[entity] === 1) {
      const currentTargetId = ModeState.targetId[entity]
      const currentTargetEntity = ctx.agents.get(currentTargetId)
      if (currentTargetEntity !== undefined) {
        const currentType = decodeArchetype(AgentMeta.archetype[currentTargetEntity])
        if (dietAgents.includes(currentType)) {
          const currentPos = { x: Position.x[currentTargetEntity], y: Position.y[currentTargetEntity] }
          const dist = Math.sqrt(distanceSquared(mePos, currentPos))
          if (dist <= vision) {
            const currentWeight =
              (1 / Math.max(dist, 1)) * (0.6 + focus * 0.4) * (1 + aggression * 0.4) * awareness
            let sizeBias = 1
            if (archetype === 'hunter' && currentType === 'prey') {
              const preyMass = approximateBodyMass(ctx, currentTargetId, currentTargetEntity)
              const ratio = preyMass / Math.max(myBodyMass, 0.001)
              const band = clamp(preySizeTargetRatio * 0.8 + 0.15, 0.15, 1.5)
              sizeBias = clamp(1 - Math.abs(ratio - preySizeTargetRatio) / band, 0.05, 1.15)
              if (ratio > 1) sizeBias *= clamp(1 / ratio, 0.05, 1)
            }
            if (currentWeight * stickiness >= bestPreyWeight) {
              bestPreyTarget = { kind: 'agent', id: currentTargetId }
              bestPreyWeight = currentWeight * sizeBias
            }
          }
        }
      }
    }

    const isScavenger = archetype === 'scavenger'
    const scavengerAffinity = clamp(isScavenger ? 1 : (genome?.scavengerAffinity ?? 0), 0, 1)
    if ((dietAgents.length || isScavenger) && (hungerRatio < 0.85 || bestPreyTarget === null)) {
      const corpseCandidates = ctx.corpseIndex.query(mePos, vision)
      corpseCandidates.forEach((bucket) => {
        const corpseEntity = ctx.corpses.get(bucket.id)
        if (corpseEntity === undefined) return
        const nutrients = Corpse.nutrients[corpseEntity] || 0
        if (nutrients <= 0.1) return
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > vision) return
        const seenChance = detectionChance(headingCos, headingSin, dx, dy, dist, vision, awarenessGene, 0, cosHalfFov)
        if (ctx.rng() > seenChance) return
        const hungerNeed = clamp(1 - hungerRatio, 0, 1)
        const weight =
          (1 / Math.max(dist, 1)) *
          (0.65 + focus * 0.35) *
          (0.85 + hungerNeed * 1.3) *
          (0.85 + scavengerAffinity * 0.6) *
          (0.7 + clamp(nutrients / 420, 0, 1.5))
        if (weight > bestCarrionWeight) {
          bestCarrionWeight = weight
          bestCarrionTarget = { kind: 'corpse', id: bucket.id }
        }
      })
    }

    if (ModeState.targetType[entity] === 3) {
      const currentCorpseId = ModeState.targetId[entity]
      const corpseEntity = ctx.corpses.get(currentCorpseId)
      if (corpseEntity !== undefined && (Corpse.nutrients[corpseEntity] || 0) > 0.1) {
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= vision) {
          const currentWeight =
            (1 / Math.max(dist, 1)) *
            (0.65 + focus * 0.35) *
            (0.85 + clamp(1 - hungerRatio, 0, 1) * 1.3) *
            (0.85 + scavengerAffinity * 0.6)
          if (currentWeight * stickiness >= bestCarrionWeight) {
            bestCarrionTarget = { kind: 'corpse', id: currentCorpseId }
            bestCarrionWeight = currentWeight
          }
        }
      }
    }

    if (bestCarrionTarget && (bestPreyTarget === null || bestCarrionWeight > bestPreyWeight * 0.9)) {
      bestPreyTarget = bestCarrionTarget
      bestPreyWeight = Math.max(bestPreyWeight, bestCarrionWeight)
    }

    // Primitive flight reflex: override any ongoing behaviour if predator is close enough
    const fear = DNA.fear[entity] ?? 0.3
    const fleeTrigger = dangerRadius * clamp((awarenessGene + fear + courageGene) / 3, 0.1, 2)
    if (predatorTarget && closestPredatorDist <= fleeTrigger) {
      threatLevel = Math.max(threatLevel, escapeTendency)
    }

    let bestPlantTarget: TargetRef | null = null
    let bestPlantWeight = -Infinity
    if (eatsPlants && (hungerRatio < 0.9 || hungerRatio < 1 && bestPreyTarget === null)) {
      const plantCandidates = ctx.plantIndex.query(mePos, vision)
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dx = plantPos.x - mePos.x
        const dy = plantPos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const seenChance = detectionChance(headingCos, headingSin, dx, dy, dist, vision, awarenessGene, 0, cosHalfFov)
        if (ctx.rng() > seenChance) return
        const weight =
          (Energy.fatCapacity[entity] * 0.2 + 1) * (1 / Math.max(dist, 1)) * (hungerRatio < 0.55 ? 1.2 : 1)
        if (weight > bestPlantWeight) {
          bestPlantWeight = weight
          bestPlantTarget = { kind: 'plant', id: bucket.id }
        }
      })
    }

    if (ModeState.targetType[entity] === 2) {
      const currentPlantId = ModeState.targetId[entity]
      const currentPlantEntity = ctx.plants.get(currentPlantId)
      if (currentPlantEntity !== undefined) {
        const dist = Math.sqrt(
          distanceSquared(mePos, { x: Position.x[currentPlantEntity], y: Position.y[currentPlantEntity] }),
        )
        if (dist <= vision) {
          const currentWeight =
            (Energy.fatCapacity[entity] * 0.2 + 1) * (1 / Math.max(dist, 1)) * (hungerRatio < 0.55 ? 1.2 : 1)
          if (currentWeight * stickiness >= bestPlantWeight) {
            bestPlantTarget = { kind: 'plant', id: currentPlantId }
            bestPlantWeight = currentWeight
          }
        }
      }
    }

    const socialCohesion = allyCount === 0 ? 0 : clamp(allyProximity / allyCount, 0, 1)
    const moodInput: MoodMachineInput = {
      hungerRatio,
      forageStartRatio: clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95),
      fatigue,
      sleepPressure,
      libido: libidoRatio,
      threatLevel: clamp(threatLevel, 0, 1),
      socialCohesion,
      curiosity,
      aggression,
      fightPersistence: genome?.fightPersistence ?? clamp(aggression, 0.05, 1),
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
      ModeState.dangerTimer[entity] = Math.max(ModeState.dangerTimer[entity], Math.max(1.25, escapeDuration))
    }

    // Scavengers only eat dead bodies: never graze plants or hunt live animals.
    if (archetype === 'scavenger') {
      const forageStartRatio = clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95)
      if (bestCarrionTarget && hungerRatio < forageStartRatio) {
        decision.behaviour.mode = 'hunt'
        decision.behaviour.target = bestCarrionTarget
      } else if (decision.behaviour.mode === 'hunt' || decision.behaviour.mode === 'graze') {
        decision.behaviour.mode = 'patrol'
        decision.behaviour.target = null
      }
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
      const survivalHold = escapeDuration * clamp(0.5 + decision.intensity, 0.5, 2)
      ModeState.dangerTimer[entity] = Math.max(
        ModeState.dangerTimer[entity],
        Math.max(decision.intensity + 0.5, survivalHold),
      )
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
  const genome = ctx.genomes.get(entityId)
  const awarenessGene = genome?.awareness ?? DNA.awareness[entity] ?? 0.5
  const vision = DNA.visionRange[entity] * (1 + (clamp(DNA.awareness[entity] ?? 0.5, 0, 1) - 0.5) * 0.6)
  const fovRadians = computeVisionFovRadians(decodeArchetype(AgentMeta.archetype[entity]), awarenessGene)
  const cosHalfFov = Math.cos(fovRadians / 2)
  const heading = Heading.angle[entity]
  const headingCos = Math.cos(heading)
  const headingSin = Math.sin(heading)
  let bestId: number | null = null
  let bestDist = Infinity
  neighbors.forEach((bucket) => {
    if (bucket.id === entityId) return
    const mateEntity = ctx.agents.get(bucket.id)
    if (mateEntity === undefined) return
    if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) return
    if (ModeState.sexCooldown[mateEntity] > 0) return
    if (Reproduction.libido[mateEntity] < (Reproduction.libidoThreshold[mateEntity] || 0.6)) return
    const dx = Position.x[mateEntity] - Position.x[entity]
    const dy = Position.y[mateEntity] - Position.y[entity]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const seenChance = detectionChance(
      headingCos,
      headingSin,
      dx,
      dy,
      dist,
      vision,
      awarenessGene,
      DNA.camo[mateEntity] ?? 0,
      cosHalfFov,
    )
    if (ctx.rng() > seenChance) return
    if (dist < bestDist) {
      bestDist = dist
      bestId = bucket.id
    }
  })
  return bestId === null ? null : { kind: 'agent', id: bestId }
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
  if (archetype === 'scavenger') return []
  return ['plant']
}
