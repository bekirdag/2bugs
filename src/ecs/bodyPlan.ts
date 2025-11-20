import type { Archetype, Biome, BodyPlanGenes, DNA, SenseGene } from '@/types/sim'
import { clamp } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'

export const BODY_PLAN_VERSION = 1

const BASE_SENSE_CONFIG: Record<Archetype, SenseGene[]> = {
  hunter: [
    { sense: 'eye', count: 2, distribution: 'head', acuity: 0.75 },
    { sense: 'ear', count: 2, distribution: 'head', acuity: 0.6 },
    { sense: 'nose', count: 1, distribution: 'head', acuity: 0.65 },
  ],
  prey: [
    { sense: 'eye', count: 2, distribution: 'head', acuity: 0.55 },
    { sense: 'ear', count: 2, distribution: 'head', acuity: 0.7 },
    { sense: 'nose', count: 1, distribution: 'head', acuity: 0.45 },
    { sense: 'touch', count: 2, distribution: 'torso', acuity: 0.4 },
  ],
  plant: [],
  scavenger: [
    { sense: 'eye', count: 2, distribution: 'head', acuity: 0.6 },
    { sense: 'nose', count: 2, distribution: 'head', acuity: 0.55 },
  ],
}

export function createBaseBodyPlan(archetype: Archetype, biome: Biome): BodyPlanGenes {
  const aggressive = archetype === 'hunter'
  const chassis = {
    length: aggressive ? 0.65 : 0.5,
    depth: aggressive ? 0.45 : 0.6,
    massBias: aggressive ? 0.55 : 0.65,
    flexibility: biome === 'air' ? 0.7 : 0.5,
    plating: aggressive ? 0.6 : 0.35,
  }

  const senses = BASE_SENSE_CONFIG[archetype] ?? []

  const limbs: BodyPlanGenes['limbs'] = []
  const appendages: BodyPlanGenes['appendages'] = []

  if (biome === 'land') {
    limbs.push({
      kind: 'leg',
      count: aggressive ? 2 : 4,
      size: aggressive ? 0.75 : 0.55,
      placement: aggressive ? 'mid' : 'mixed',
      gaitStyle: aggressive ? 0.8 : 0.5,
    })
    appendages.push({
      kind: 'tail',
      size: aggressive ? 0.7 : 0.5,
      split: 0,
    })
  } else if (biome === 'water') {
    appendages.push({
      kind: 'fin',
      count: 2,
      size: 0.7,
      placement: 'lateral',
      steeringBias: aggressive ? 0.6 : 0.5,
    })
    appendages.push({
      kind: 'muscle-band',
      density: 0.6,
      flexibility: 0.65,
    })
    appendages.push({
      kind: 'tail',
      size: 0.8,
      split: 0.2,
    })
  } else if (biome === 'air') {
    limbs.push({
      kind: 'wing',
      count: 2,
      span: aggressive ? 0.85 : 0.9,
      surface: aggressive ? 0.65 : 0.75,
      articulation: 0.7,
    })
    limbs.push({
      kind: 'leg',
      count: 2,
      size: 0.35,
      placement: 'rear',
      gaitStyle: 0.3,
    })
    appendages.push({
      kind: 'tail',
      size: 0.6,
      split: 0,
    })
  }

  return {
    chassis,
    senses: senses.map((sense) => ({ ...sense })),
    limbs,
    appendages,
  }
}

export function cloneBodyPlan(plan: BodyPlanGenes): BodyPlanGenes {
  return {
    chassis: { ...plan.chassis },
    senses: plan.senses.map((sense) => ({ ...sense })),
    limbs: plan.limbs.map((limb) => ({ ...limb })),
    appendages: plan.appendages.map((app) => ({ ...app })),
  }
}

const BASE_VISION: Record<Archetype, number> = {
  hunter: 320,
  prey: 240,
  plant: 0,
  scavenger: 260,
}

const BASE_AWARENESS: Record<Archetype, number> = {
  hunter: 0.65,
  prey: 0.55,
  plant: 0,
  scavenger: 0.5,
}

const SENSE_WEIGHT: Record<SenseGene['sense'], number> = {
  eye: 0.45,
  ear: 0.25,
  nose: 0.15,
  touch: 0.1,
  taste: 0.05,
}

const SENSE_COST: Record<SenseGene['sense'], number> = {
  eye: 0.4,
  ear: 0.3,
  nose: 0.2,
  touch: 0.15,
  taste: 0.1,
}

export type SenseDerivedStats = {
  visionRange: number
  awareness: number
  upkeep: number
}

export function deriveSenseStats(plan: BodyPlanGenes, archetype: Archetype): SenseDerivedStats {
  const groups = plan.senses.reduce<Record<SenseGene['sense'], { count: number; acuity: number }>>(
    (acc, sense) => {
      const slot = acc[sense.sense] ?? { count: 0, acuity: 0 }
      slot.count += sense.count
      slot.acuity += sense.acuity * sense.count
      acc[sense.sense] = slot
      return acc
    },
    {
      eye: { count: 0, acuity: 0 },
      ear: { count: 0, acuity: 0 },
      nose: { count: 0, acuity: 0 },
      touch: { count: 0, acuity: 0 },
      taste: { count: 0, acuity: 0 },
    },
  )

  const eye = groups.eye
  const eyeCount = Math.max(eye.count, 0)
  const avgEyeAcuity = eyeCount > 0 ? eye.acuity / eyeCount : 0.4
  const visionStretch = 0.4 + Math.min(eyeCount, 4) * 0.15
  const visionAcuity = 0.6 + avgEyeAcuity * 0.4
  const visionRange = BASE_VISION[archetype] * visionStretch * visionAcuity

  const awarenessContrib =
    (Object.entries(groups) as [SenseGene['sense'], { count: number; acuity: number }][])
      .filter(([sense]) => sense !== 'taste')
      .reduce((sum, [sense, stats]) => {
        if (stats.count <= 0) return sum
        const avg = stats.acuity / stats.count
        return sum + SENSE_WEIGHT[sense]! * (0.4 + avg * 0.6) * clamp(stats.count / 4, 0.2, 1)
      }, 0)

  const awareness = clamp(BASE_AWARENESS[archetype] + awarenessContrib, 0.25, 1)

  const upkeep = plan.senses.reduce((sum, sense) => {
    return sum + sense.count * (SENSE_COST[sense.sense] ?? 0.1) * (0.7 + sense.acuity * 0.6)
  }, 0)

  return { visionRange, awareness, upkeep }
}

export function ensureBodyPlan(dna: DNA): DNA {
  const biome = dna.biome ?? 'land'
  if (dna.bodyPlan && dna.bodyPlanVersion >= BODY_PLAN_VERSION) {
    return {
      ...dna,
      biome,
      bodyPlanVersion: dna.bodyPlanVersion,
    }
  }
  return {
    ...dna,
    biome,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(dna.archetype, biome),
  }
}

function applySenseOverrides(dna: DNA): DNA {
  if (!featureFlags.sensesFromBodyPlan) {
    return {
      ...dna,
      senseUpkeep: dna.senseUpkeep ?? 0,
    }
  }
  if (!dna.bodyPlan) {
    return {
      ...dna,
      senseUpkeep: dna.senseUpkeep ?? 0,
    }
  }
  const derived = deriveSenseStats(dna.bodyPlan, dna.archetype)
  return {
    ...dna,
    visionRange: derived.visionRange,
    awareness: derived.awareness,
    senseUpkeep: derived.upkeep,
  }
}

export function prepareDNA(dna: DNA): DNA {
  const ensured = ensureBodyPlan(dna)
  const normalized = {
    ...ensured,
    bodyPlan: cloneBodyPlan(ensured.bodyPlan),
    senseUpkeep: ensured.senseUpkeep ?? 0,
    bodyPlanVersion: ensured.bodyPlanVersion ?? BODY_PLAN_VERSION,
  }
  return applySenseOverrides(normalized)
}
