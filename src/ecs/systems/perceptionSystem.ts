import {
  AgentMeta,
  Body,
  Corpse,
  PlantStats,
  Digestion,
  DNA,
  Energy,
  Heading,
  Intent,
  ModeState,
  Mood,
  Position,
  ArchetypeCode,
  Reproduction,
  Obstacle,
} from '../components'
import { applyBehaviourIntent } from '../mood/behaviorEngine'
import { resolveMood, type MoodMachineInput } from '../mood/moodMachine'
import { decodeMoodKind, encodeMoodKind, encodeMoodTier } from '../mood/moodCatalog'
import type { SimulationContext } from '../types'
import type { ControlState, TargetRef, DNA as GenomeDNA } from '@/types/sim'
import { clamp, distanceSquared } from '@/utils/math'
import { corpseEdibleByStage } from '@/ecs/corpseStages'

function rad(deg: number) {
  return (deg * Math.PI) / 180
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
  // Strict directional vision: if the target is outside the eye's FOV, it is not seen at all.
  const fovFactor = dot >= cosHalfFov ? 1 : 0

  const distFactor = clamp(1 - dist / Math.max(maxDist, 1), 0, 1)
  const awarenessFactor = clamp(0.65 + awarenessGene * 0.7, 0.4, 1.35)
  const camoFactor = clamp(1 - clamp(targetCamo, 0, 1) * 0.6, 0.2, 1)

  return clamp((0.1 + distFactor * 0.9) * fovFactor * awarenessFactor * camoFactor, 0, 1)
}

type SenseProfile = {
  visualRange: number
  senseRange: number
  hearingRange: number
  smellRange: number
  // Eye direction vectors in world space (already includes current heading).
  eyeDirs: { cos: number; sin: number }[]
  cosHalfEyeFov: number
  earDirs: { cos: number; sin: number }[]
  cosHalfEarFov: number
  earSideHints: number[]
  noseDirs: { cos: number; sin: number }[]
  cosHalfNoseFov: number
  noseForwardBias: number
  headingCos: number
  headingSin: number
  hasAnySense: boolean
}

function buildSenseProfile(
  genome: GenomeDNA | undefined,
  archetype: string,
  awarenessGene: number,
  heading: number,
  visualGeneRange: number,
): SenseProfile {
  const plan = genome?.bodyPlan
  const senses = plan?.senses ?? []
  let eyeCount = 0
  let earCount = 0
  let noseCount = 0
  let touchCount = 0
  let earAcuitySum = 0
  let noseAcuitySum = 0

  const eyeAngles: number[] = []
  const earAngles: number[] = []
  const earSideHints: number[] = []
  const noseAngles: number[] = []
  const noseX: number[] = []
  senses.forEach((sense) => {
    if (sense.count <= 0) return
    if (sense.sense === 'eye') {
      eyeCount += sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          eyeAngles.push(angle)
        }
      }
      // If a gene predates layouts, approximate a forward-facing default.
      while (eyeAngles.length < eyeCount) {
        eyeAngles.push(0)
      }
    } else if (sense.sense === 'ear') {
      earCount += sense.count
      earAcuitySum += sense.acuity * sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        const y = placements[i]?.y
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          earAngles.push(angle)
        }
        if (typeof y === 'number' && Number.isFinite(y)) {
          earSideHints.push(y === 0 ? 0 : y < 0 ? -1 : 1)
        }
      }
      while (earAngles.length < earCount) {
        // Default to lateral "coverage" if missing.
        earAngles.push(earAngles.length % 2 === 0 ? -Math.PI / 2 : Math.PI / 2)
        earSideHints.push(earSideHints.length % 2 === 0 ? -1 : 1)
      }
    } else if (sense.sense === 'nose') {
      noseCount += sense.count
      noseAcuitySum += sense.acuity * sense.count
      const placements = sense.layout?.placements ?? []
      for (let i = 0; i < Math.min(placements.length, sense.count); i++) {
        const angle = placements[i]?.angle
        const x = placements[i]?.x
        if (typeof angle === 'number' && Number.isFinite(angle)) {
          noseAngles.push(angle)
        }
        if (typeof x === 'number' && Number.isFinite(x)) {
          noseX.push(x)
        }
      }
      while (noseAngles.length < noseCount) {
        noseAngles.push(0)
        noseX.push(0.45)
      }
    } else if (sense.sense === 'touch') {
      touchCount += sense.count
    }
  })

  const hasAnySense = eyeCount + earCount + noseCount + touchCount > 0

  const visualRange = eyeCount > 0 ? visualGeneRange : 0

  const avgEarAcuity = earCount > 0 ? earAcuitySum / earCount : 0.5
  const avgNoseAcuity = noseCount > 0 ? noseAcuitySum / noseCount : 0.5
  const awarenessFactor = 0.85 + clamp(awarenessGene, 0, 1) * 0.3
  const hearingRange =
    earCount <= 0 ? 0 : clamp((70 + earCount * 45 * (0.65 + avgEarAcuity * 0.7)) * awarenessFactor, 24, 360)
  const smellRange =
    noseCount <= 0 ? 0 : clamp((60 + noseCount * 50 * (0.65 + avgNoseAcuity * 0.7)) * awarenessFactor, 24, 420)

  const perEyeFov = archetype === 'hunter' ? rad(110) : rad(140)
  const eyeFov = clamp(perEyeFov * (0.8 + clamp(awarenessGene, 0, 1) * 0.5), rad(55), rad(175))
  const cosHalfEyeFov = Math.cos(eyeFov / 2)
  const eyeDirs =
    eyeCount <= 0
      ? []
      : eyeAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const earFovBase = archetype === 'hunter' ? rad(260) : rad(300)
  const earFov = clamp(earFovBase * (0.85 + clamp(awarenessGene, 0, 1) * 0.35), rad(170), rad(330))
  const cosHalfEarFov = Math.cos(earFov / 2)
  const earDirs =
    earCount <= 0
      ? []
      : earAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const noseFovBase = archetype === 'hunter' ? rad(220) : rad(240)
  const noseFov = clamp(noseFovBase * (0.85 + clamp(awarenessGene, 0, 1) * 0.25), rad(140), rad(300))
  const cosHalfNoseFov = Math.cos(noseFov / 2)
  const noseDirs =
    noseCount <= 0
      ? []
      : noseAngles.map((angle) => {
          const a = heading + angle
          return { cos: Math.cos(a), sin: Math.sin(a) }
        })

  const noseForwardBias =
    noseX.length > 0 ? clamp(noseX.reduce((sum, v) => sum + v, 0) / noseX.length, -0.65, 0.65) : 0
  const headingCos = Math.cos(heading)
  const headingSin = Math.sin(heading)

  const senseRange = Math.max(visualRange, hearingRange, smellRange, touchCount > 0 ? 26 : 0)

  return {
    visualRange,
    senseRange,
    hearingRange,
    smellRange,
    eyeDirs,
    cosHalfEyeFov,
    earDirs,
    cosHalfEarFov,
    earSideHints,
    noseDirs,
    cosHalfNoseFov,
    noseForwardBias,
    headingCos,
    headingSin,
    hasAnySense,
  }
}

function combinedDetectionChance(
  senses: SenseProfile,
  dx: number,
  dy: number,
  dist: number,
  awarenessGene: number,
  targetCamo: number,
  rng: () => number,
  occlusion?: { vision?: number; hearing?: number; smell?: number },
) {
  if (!senses.hasAnySense) return 0
  if (dist <= 12) return 1

  const inv = 1 / Math.max(dist, 0.001)
  const dirX = dx * inv
  const dirY = dy * inv

  let visual = 0
  if (senses.visualRange > 0 && dist <= senses.visualRange && senses.eyeDirs.length) {
    let best = senses.eyeDirs[0]
    let bestDot = -Infinity
    for (const eye of senses.eyeDirs) {
      const dot = dirX * eye.cos + dirY * eye.sin
      if (dot > bestDot) {
        bestDot = dot
        best = eye
      }
    }
    visual =
      detectionChance(best.cos, best.sin, dx, dy, dist, senses.visualRange, awarenessGene, targetCamo, senses.cosHalfEyeFov) *
      (occlusion?.vision ?? 1)
  }

  let hearing = 0
  if (senses.hearingRange > 0 && dist <= senses.hearingRange && senses.earDirs.length) {
    let bestDot = -Infinity
    for (const ear of senses.earDirs) {
      bestDot = Math.max(bestDot, dirX * ear.cos + dirY * ear.sin)
    }
    if (bestDot >= senses.cosHalfEarFov) {
      const side = dirX * -senses.headingSin + dirY * senses.headingCos
      const sideSign = side === 0 ? 0 : side < 0 ? -1 : 1
      const hasMatchingEar =
        sideSign === 0 ? true : senses.earSideHints.some((hint) => hint === 0 || hint === sideSign)
      const stereoBias = hasMatchingEar ? 1.12 : 0.92
      hearing = clamp(
        (1 - dist / senses.hearingRange) *
          (0.18 + clamp(awarenessGene, 0, 1) * 0.35) *
          (1 - targetCamo * 0.15) *
          stereoBias *
          (occlusion?.hearing ?? 1),
        0,
        1,
      )
    }
  }

  let smell = 0
  if (senses.smellRange > 0 && dist <= senses.smellRange && senses.noseDirs.length) {
    let bestDot = -Infinity
    for (const nose of senses.noseDirs) {
      bestDot = Math.max(bestDot, dirX * nose.cos + dirY * nose.sin)
    }
    if (bestDot >= senses.cosHalfNoseFov) {
      const forward = dirX * senses.headingCos + dirY * senses.headingSin
      const forwardBias = forward > 0 ? 1 + clamp(senses.noseForwardBias, 0, 0.65) * 0.25 : 1
      smell = clamp(
        (1 - dist / senses.smellRange) *
          (0.12 + clamp(awarenessGene, 0, 1) * 0.25) *
          forwardBias *
          (occlusion?.smell ?? 1),
        0,
        1,
      )
    }
  }

  const combined = 1 - (1 - visual) * (1 - hearing) * (1 - smell)
  // Add a tiny bit of noise so identical candidates don't lockstep forever.
  const jitter = (rng() - 0.5) * 0.03
  return clamp(combined + jitter, 0, 1)
}

function occlusionFactors(ctx: SimulationContext, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (!ctx.rocks || ctx.rocks.size === 0) return { vision: 1, hearing: 1, smell: 1 }
  const ax = from.x
  const ay = from.y
  const bx = to.x
  const by = to.y
  const abx = bx - ax
  const aby = by - ay
  const abLen2 = abx * abx + aby * aby
  if (abLen2 < 1e-6) return { vision: 1, hearing: 1, smell: 1 }

  for (const rockEntity of ctx.rocks.values()) {
    const r = (Obstacle.radius[rockEntity] || 0) + 6
    if (r <= 1) continue
    const cx = Position.x[rockEntity]
    const cy = Position.y[rockEntity]
    const t = clamp(((cx - ax) * abx + (cy - ay) * aby) / abLen2, 0, 1)
    const px = ax + abx * t
    const py = ay + aby * t
    const dx = cx - px
    const dy = cy - py
    if (dx * dx + dy * dy <= r * r) {
      // Hardest on vision; partially attenuates hearing/smell.
      return { vision: 0.12, hearing: 0.7, smell: 0.55 }
    }
  }
  return { vision: 1, hearing: 1, smell: 1 }
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
    const birthTick = ctx.birthTick.get(id) ?? ctx.tick
    const yearTicks = Math.max(1, ctx.yearTicks || 2400)
    const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
    const maturityAgeYears = clamp(genome?.maturityAgeYears ?? 1, 1, 20)
    const isMature = ageYears >= maturityAgeYears
    const escapeDuration = clamp(genome?.escapeDuration ?? 2, 0.5, 12)
    const lingerRate = clamp(genome?.lingerRate ?? 0.5, 0, 1)
    const attentionSpan = clamp(genome?.attentionSpan ?? 0.5, 0.1, 2)

    const stress = Mood.stress[entity]
    const focus = Mood.focus[entity]
    const hungerThreshold = genome?.hungerThreshold ?? Energy.metabolism[entity] * 8
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
    const libidoForMood = isMature ? libidoRatio : 0
    const aggression = clamp((DNA.aggression[entity] ?? 0.4) + (controls.aggressionBias ?? 0), 0, 1)
    const curiosity = clamp((DNA.curiosity[entity] ?? 0.3) + (controls.curiosityBias ?? 0), 0.05, 1)
    const awareness = clamp((DNA.awareness[entity] ?? 0.5) + (controls.curiosityBias ?? 0) * 0.5, 0.05, 1)
    const archetype = decodeArchetype(AgentMeta.archetype[entity])
    const cannibalism = clamp(genome?.cannibalism ?? DNA.cannibalism[entity] ?? 0, 0, 1)
    let preferredFood =
      genome?.preferredFood && genome.preferredFood.length ? genome.preferredFood : archetypeDiet(archetype)
    if (archetype === 'hunter') {
      preferredFood = cannibalism >= 0.5 ? ['prey', 'scavenger', 'hunter'] : ['prey', 'scavenger']
    }
    const eatsPlants = preferredFood.includes('plant')
    const dietAgents = preferredFood.filter((type) => type !== 'plant')
    const speciesFear = clamp(DNA.speciesFear[entity] ?? DNA.fear[entity] ?? 0.3, 0, 1)
    const conspecificFear = clamp(DNA.conspecificFear[entity] ?? 0.25, 0, 1)
    const sizeFear = clamp(DNA.sizeFear[entity] ?? 0.5, 0, 1)

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const visualGeneRange = DNA.visionRange[entity] * (1 + (awareness - 0.5) * 0.6)
    const heading = Heading.angle[entity]
    const awarenessGene = genome?.awareness ?? DNA.awareness[entity] ?? 0.5
    const senses = buildSenseProfile(genome, archetype, awarenessGene, heading, visualGeneRange)
    const neighbors = ctx.agentIndex.query(mePos, senses.senseRange)

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

    const dangerRadius = genome?.dangerRadius ?? senses.senseRange
    const escapeTendency = clamp(
      genome?.escapeTendency ?? DNA.cowardice[entity] ?? DNA.fear[entity] ?? 0.3,
      0.01,
      2,
    )
    const courageGene = genome?.bravery ?? 0.5
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
      if (dist > senses.senseRange) return
      const occ = occlusionFactors(ctx, mePos, otherPos)
      const seenChance = combinedDetectionChance(
        senses,
        dx,
        dy,
        dist,
        awarenessGene,
        DNA.camo[otherEntity] ?? 0,
        ctx.rng,
        occ,
      )
      if (ctx.rng() > seenChance) return

      const sameSpecies = otherType === archetype
      const sameFamily = AgentMeta.familyColor[otherEntity] === AgentMeta.familyColor[entity]
      if (sameSpecies) {
        allyCount += 1
        allyProximity += clamp(1 - dist / Math.max(senses.senseRange, 1), 0, 1)
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
      const potentialFood = dietAgents.includes(otherType)

      // Treat likely prey as non-threatening (otherwise timid hunters will flee from prey).
      // Prey can still become threatening via size mismatch (sizeRatio > 1).
      if (!(potentialFood && sizeRatio <= 1)) {
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
        const proximity = clamp(1 - dist / Math.max(senses.senseRange, 1), 0, 1)
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
          if (dist <= senses.senseRange) {
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
    if (
      (dietAgents.length || isScavenger) &&
      (hungerRatio < 0.85 || bestPreyTarget === null || archetype === 'hunter')
    ) {
      const corpseCandidates = ctx.corpseIndex.query(mePos, senses.senseRange)
      corpseCandidates.forEach((bucket) => {
        const corpseEntity = ctx.corpses.get(bucket.id)
        if (corpseEntity === undefined) return
        const nutrients = Corpse.nutrients[corpseEntity] || 0
        if (nutrients <= 0.1) return
        const corpseArchetype = Corpse.archetype[corpseEntity]
          ? decodeArchetype(Corpse.archetype[corpseEntity])
          : undefined
        if (!corpseEdibleByStage(Corpse.stage[corpseEntity], archetype, corpseArchetype, cannibalism)) return
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > senses.senseRange) return
        const occ = occlusionFactors(ctx, mePos, corpsePos)
        const seenChance = combinedDetectionChance(senses, dx, dy, dist, awarenessGene, 0, ctx.rng, occ)
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
      if (
        corpseEntity !== undefined &&
        (Corpse.nutrients[corpseEntity] || 0) > 0.1 &&
        corpseEdibleByStage(
          Corpse.stage[corpseEntity],
          archetype,
          Corpse.archetype[corpseEntity] ? decodeArchetype(Corpse.archetype[corpseEntity]) : undefined,
          cannibalism,
        )
      ) {
        const corpsePos = { x: Position.x[corpseEntity], y: Position.y[corpseEntity] }
        const dx = corpsePos.x - mePos.x
        const dy = corpsePos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= senses.senseRange) {
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
      const plantCandidates = ctx.plantIndex.query(mePos, senses.senseRange)
      plantCandidates.forEach((bucket) => {
        const plantEntity = ctx.plants.get(bucket.id)
        if (plantEntity === undefined) return
        if ((PlantStats.biomass[plantEntity] || 0) <= 0.12) return
        const plantPos = { x: Position.x[plantEntity], y: Position.y[plantEntity] }
        const dx = plantPos.x - mePos.x
        const dy = plantPos.y - mePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const occ = occlusionFactors(ctx, mePos, plantPos)
        const seenChance = combinedDetectionChance(senses, dx, dy, dist, awarenessGene, 0, ctx.rng, occ)
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
        if (dist <= senses.senseRange) {
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
    const eatingGreed = clamp(genome?.eatingGreed ?? 0.5, 0, 1)
    const digestionBaseline = 120 + myBodyMass * 90
    const metabolismGene = clamp(DNA.metabolism[entity] ?? 8, 2, 16)
    const metabolismFactor = clamp(1.2 - (metabolismGene - 8) * 0.05, 0.6, 1.4)
    const digestionPressure = clamp(
      ((Digestion.recentIntake[entity] ?? 0) / Math.max(digestionBaseline, 1)) *
        (0.7 + eatingGreed * 0.6) *
        metabolismFactor,
      0,
      1,
    )
    const staminaGene = clamp(DNA.stamina[entity] ?? 1, 0.4, 1.6)
    const staminaFactor = clamp(1.15 - (staminaGene - 1) * 0.6, 0.5, 1.5)
    const sleepEfficiency = clamp(DNA.sleepEfficiency[entity] ?? 0.8, 0.4, 1.2)
    const efficiencyFactor = clamp(1.1 - (sleepEfficiency - 0.8) * 0.5, 0.6, 1.4)
    const recoveryPressure = clamp(fatigue * staminaFactor + sleepPressure * 0.35 * efficiencyFactor, 0, 1)
    const moodInput: MoodMachineInput = {
      hungerRatio,
      forageStartRatio: clamp(genome?.forageStartRatio ?? 0.65, 0.25, 0.95),
      fatigue,
      sleepPressure,
      digestionPressure,
      recoveryPressure,
      libido: libidoForMood,
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
  const selfGenome = ctx.genomes.get(entityId)
  const birthTick = ctx.birthTick.get(entityId) ?? ctx.tick
  const yearTicks = Math.max(1, ctx.yearTicks || 2400)
  const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
  const maturityAgeYears = clamp(selfGenome?.maturityAgeYears ?? 1, 1, 20)
  if (ageYears < maturityAgeYears) return null

  const libido = Reproduction.libido[entity]
  const libidoThreshold = Reproduction.libidoThreshold[entity] || 0.6
  if (libido < libidoThreshold) return null
  const awarenessGene = selfGenome?.awareness ?? DNA.awareness[entity] ?? 0.5
  const heading = Heading.angle[entity]
  const archetype = decodeArchetype(AgentMeta.archetype[entity])
  const visualGeneRange =
    DNA.visionRange[entity] * (1 + (clamp(DNA.awareness[entity] ?? 0.5, 0, 1) - 0.5) * 0.6)
  const senses = buildSenseProfile(selfGenome, archetype, awarenessGene, heading, visualGeneRange)
  let bestId: number | null = null
  let bestDist = Infinity
  neighbors.forEach((bucket) => {
    if (bucket.id === entityId) return
    const mateEntity = ctx.agents.get(bucket.id)
    if (mateEntity === undefined) return
    const mateGenome = ctx.genomes.get(bucket.id)
    const mateBirthTick = ctx.birthTick.get(bucket.id) ?? ctx.tick
    const mateAgeYears = Math.max(0, ctx.tick - mateBirthTick) / yearTicks
    const mateMaturityAge = clamp(mateGenome?.maturityAgeYears ?? 1, 1, 20)
    if (mateAgeYears < mateMaturityAge) return
    if (AgentMeta.archetype[mateEntity] !== AgentMeta.archetype[entity]) return
    if (ModeState.sexCooldown[mateEntity] > 0) return
    if (Reproduction.libido[mateEntity] < (Reproduction.libidoThreshold[mateEntity] || 0.6)) return
    const dx = Position.x[mateEntity] - Position.x[entity]
    const dy = Position.y[mateEntity] - Position.y[entity]
    const dist = Math.sqrt(dx * dx + dy * dy)
    const occ = occlusionFactors(ctx, { x: Position.x[entity], y: Position.y[entity] }, { x: Position.x[mateEntity], y: Position.y[mateEntity] })
    const seenChance = combinedDetectionChance(
      senses,
      dx,
      dy,
      dist,
      awarenessGene,
      DNA.camo[mateEntity] ?? 0,
      ctx.rng,
      occ,
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
  if (archetype === 'hunter') return ['prey', 'scavenger']
  if (archetype === 'scavenger') return []
  return ['plant']
}

export const __test__ = {
  buildSenseProfile,
  combinedDetectionChance,
}
