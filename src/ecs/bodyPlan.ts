import type {
  Archetype,
  Biome,
  BodyPlanGenes,
  DNA,
  FlightLocomotionStats,
  LandLocomotionStats,
  LegGene,
  LegMount,
  OrganPlacement,
  MovementProfile,
  SenseGene,
  SwimLocomotionStats,
} from '@/types/sim'
import { clamp } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'

export const BODY_PLAN_VERSION = 2

function rad(deg: number) {
  return (deg * Math.PI) / 180
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function ensurePlacementFinite(p: OrganPlacement): OrganPlacement {
  return {
    x: Number.isFinite(p.x) ? p.x : 0,
    y: Number.isFinite(p.y) ? p.y : 0,
    angle: Number.isFinite(p.angle) ? p.angle : 0,
  }
}

function defaultEyePlacements(archetype: Archetype, count: number): OrganPlacement[] {
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount <= 0) return []

  if (archetype === 'hunter') {
    const base: OrganPlacement[] = [
      { x: 0.42, y: -0.18, angle: 0 },
      { x: 0.42, y: 0.18, angle: 0 },
      { x: 0.38, y: -0.12, angle: rad(-28) },
      { x: 0.38, y: 0.12, angle: rad(28) },
      { x: 0.34, y: 0, angle: rad(10) },
      { x: 0.3, y: 0, angle: Math.PI },
    ]
    return base.slice(0, safeCount).map(ensurePlacementFinite)
  }

  // Prey default to more lateral vision; extra eyes can fill peripheral coverage.
  const base: OrganPlacement[] = [
    { x: 0.38, y: -0.26, angle: -Math.PI / 2 },
    { x: 0.38, y: 0.26, angle: Math.PI / 2 },
    { x: 0.3, y: -0.18, angle: rad(-120) },
    { x: 0.3, y: 0.18, angle: rad(120) },
    { x: 0.24, y: 0, angle: Math.PI },
    { x: 0.34, y: 0, angle: 0 },
  ]
  return base.slice(0, safeCount).map(ensurePlacementFinite)
}

function defaultEarPlacements(archetype: Archetype, count: number): OrganPlacement[] {
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount <= 0) return []
  const lateral = archetype === 'hunter' ? 0.22 : 0.28
  const base: OrganPlacement[] = [
    { x: 0.18, y: -lateral, angle: -Math.PI / 2 },
    { x: 0.18, y: lateral, angle: Math.PI / 2 },
    { x: 0.12, y: -lateral * 0.85, angle: rad(-100) },
    { x: 0.12, y: lateral * 0.85, angle: rad(100) },
  ]
  return base.slice(0, safeCount).map(ensurePlacementFinite)
}

function defaultNosePlacements(archetype: Archetype, count: number): OrganPlacement[] {
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount <= 0) return []
  const forward = archetype === 'hunter' ? 0.52 : 0.48
  const base: OrganPlacement[] = [
    { x: forward, y: 0, angle: 0 },
    { x: forward * 0.95, y: -0.08, angle: rad(-12) },
    { x: forward * 0.95, y: 0.08, angle: rad(12) },
    { x: forward * 0.9, y: 0, angle: rad(22) },
  ]
  return base.slice(0, safeCount).map(ensurePlacementFinite)
}

function defaultSensePlacements(archetype: Archetype, sense: SenseGene['sense'], count: number): OrganPlacement[] {
  if (sense === 'eye') return defaultEyePlacements(archetype, count)
  if (sense === 'ear') return defaultEarPlacements(archetype, count)
  if (sense === 'nose') return defaultNosePlacements(archetype, count)
  // touch/taste: nondirectional, approximate torso/head.
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount <= 0) return []
  const base: OrganPlacement[] = [
    { x: 0.05, y: -0.18, angle: 0 },
    { x: 0.05, y: 0.18, angle: 0 },
    { x: -0.15, y: 0, angle: 0 },
    { x: 0.22, y: 0, angle: 0 },
  ]
  return base.slice(0, safeCount).map(ensurePlacementFinite)
}

function defaultLegMounts(count: number, placement: LegGene['placement']): LegMount[] {
  const total = Math.max(0, Math.floor(count))
  if (total <= 0) return []

  const mounts: LegMount[] = []
  const pairCount = Math.max(1, Math.ceil(total / 2))
  const anchor =
    placement === 'front' ? 0.28 : placement === 'rear' ? -0.28 : placement === 'mid' ? 0 : 0.18

  for (let i = 0; i < total; i++) {
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1
    const pairIndex = Math.floor(i / 2)
    let x = anchor
    if (placement === 'mixed') {
      const t = pairCount <= 1 ? 0.5 : pairIndex / (pairCount - 1)
      x = 0.28 - t * 0.56
    } else if (total >= 4 && placement === 'mid') {
      const t = pairCount <= 1 ? 0.5 : pairIndex / (pairCount - 1)
      x = 0.12 - t * 0.24
    }
    mounts.push({ x, side })
  }

  return mounts
}

function defaultTailMounts(count: number): OrganPlacement[] {
  const total = Math.max(0, Math.floor(count))
  if (total <= 0) return []
  const mounts: OrganPlacement[] = []
  for (let i = 0; i < total; i++) {
    const t = total <= 1 ? 0 : i / (total - 1)
    const y = total <= 1 ? 0 : -0.16 + t * 0.32
    mounts.push({ x: -0.5, y, angle: Math.PI })
  }
  return mounts.map(ensurePlacementFinite)
}

function normalizeBodyPlanLayouts(plan: BodyPlanGenes, archetype: Archetype) {
  plan.senses.forEach((sense) => {
    const desired = Math.max(0, Math.floor(sense.count))
    if (!sense.layout) {
      sense.layout = { placements: defaultSensePlacements(archetype, sense.sense, desired) }
      return
    }
    const next = (sense.layout.placements ?? []).slice(0, desired)
    while (next.length < desired) {
      next.push(...defaultSensePlacements(archetype, sense.sense, desired - next.length))
    }
    sense.layout.placements = next.slice(0, desired).map(ensurePlacementFinite)
  })

  plan.limbs.forEach((limb) => {
    if (limb.kind !== 'leg') return
    if (!limb.layout) {
      limb.layout = { mounts: defaultLegMounts(limb.count, limb.placement) }
    }
    const desired = Math.max(0, Math.floor(limb.count))
    if (limb.layout.mounts.length !== desired) {
      limb.layout.mounts = defaultLegMounts(desired, limb.placement)
    }
  })

  plan.appendages.forEach((appendage) => {
    if (appendage.kind !== 'tail') return
    const count = Math.max(0, Math.floor((appendage as any).count ?? 1))
    ;(appendage as any).count = count
    if (!appendage.layout) {
      appendage.layout = { mounts: defaultTailMounts(count) }
    }
    const desired = count
    if (appendage.layout.mounts.length !== desired) {
      appendage.layout.mounts = defaultTailMounts(desired)
    } else {
      appendage.layout.mounts = appendage.layout.mounts.map(ensurePlacementFinite)
    }
  })
}

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

  const senses = (BASE_SENSE_CONFIG[archetype] ?? []).map((sense) => ({
    ...sense,
    layout: { placements: defaultSensePlacements(archetype, sense.sense, sense.count) },
  }))

  const limbs: BodyPlanGenes['limbs'] = []
  const appendages: BodyPlanGenes['appendages'] = []

  if (biome === 'land') {
    const legGene: LegGene = {
      kind: 'leg',
      count: aggressive ? 2 : 4,
      size: aggressive ? 0.75 : 0.55,
      placement: aggressive ? 'mid' : 'mixed',
      gaitStyle: aggressive ? 0.8 : 0.5,
    }
    legGene.layout = { mounts: defaultLegMounts(legGene.count, legGene.placement) }
    limbs.push(legGene)
    appendages.push({
      kind: 'tail',
      count: 1,
      size: aggressive ? 0.7 : 0.5,
      split: 0,
      layout: { mounts: defaultTailMounts(1) },
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
      count: 1,
      size: 0.8,
      split: 0.2,
      layout: { mounts: defaultTailMounts(1) },
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
      count: 1,
      size: 0.6,
      split: 0,
      layout: { mounts: defaultTailMounts(1) },
    })
  }

  const plan: BodyPlanGenes = {
    chassis,
    senses,
    limbs,
    appendages,
  }
  normalizeBodyPlanLayouts(plan, archetype)
  return plan
}

export function cloneBodyPlan(plan: BodyPlanGenes): BodyPlanGenes {
  return {
    chassis: { ...plan.chassis },
    senses: plan.senses.map((sense) => ({
      ...sense,
      layout: sense.layout
        ? { placements: sense.layout.placements.map((placement) => ({ ...placement })) }
        : undefined,
    })),
    limbs: plan.limbs.map((limb) => {
      if (limb.kind !== 'leg') return { ...limb }
      return {
        ...limb,
        layout: limb.layout ? { mounts: limb.layout.mounts.map((mount) => ({ ...mount })) } : undefined,
      }
    }),
    appendages: plan.appendages.map((app) => {
      if (app.kind !== 'tail') return { ...app }
      return {
        ...app,
        count: (app as any).count ?? 1,
        layout: app.layout ? { mounts: app.layout.mounts.map((mount) => ({ ...mount })) } : undefined,
      }
    }),
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
  eye: 0.2,
  ear: 0.15,
  nose: 0.1,
  touch: 0.08,
  taste: 0.05,
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
    // Constant energy upkeep per organ (acuity affects capability, not baseline cost).
    return sum + sense.count * (SENSE_COST[sense.sense] ?? 0.1)
  }, 0)

  return { visionRange, awareness, upkeep }
}

export function ensureBodyPlan(dna: DNA): DNA {
  const biome = dna.biome ?? 'land'
  const version = dna.bodyPlanVersion ?? 0
  if (!dna.bodyPlan) {
    return {
      ...dna,
      biome,
      bodyPlanVersion: BODY_PLAN_VERSION,
      bodyPlan: createBaseBodyPlan(dna.archetype, biome),
    }
  }
  if (version >= BODY_PLAN_VERSION) {
    const upgraded = cloneBodyPlan(dna.bodyPlan)
    normalizeBodyPlanLayouts(upgraded, dna.archetype)
    return {
      ...dna,
      biome,
      bodyPlanVersion: version,
      bodyPlan: upgraded,
    }
  }
  const upgraded = cloneBodyPlan(dna.bodyPlan)
  normalizeBodyPlanLayouts(upgraded, dna.archetype)
  return {
    ...dna,
    biome,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: upgraded,
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
    cowardice: ensured.cowardice ?? ensured.fear ?? 0.4,
    speciesFear: ensured.speciesFear ?? ensured.fear ?? 0.4,
    conspecificFear: ensured.conspecificFear ?? 0.25,
    sizeFear: ensured.sizeFear ?? 0.5,
    dependency: ensured.dependency ?? 0.5,
    independenceAge: ensured.independenceAge ?? 20,
    maturityAgeYears: clamp(
      ensured.maturityAgeYears ??
        // Larger species tend to mature later; hunters generally mature slightly later than prey.
        (1 +
          Math.pow(clamp(ensured.bodyMass ?? 1, 0.2, 80), 0.55) * 2.8 +
          (ensured.archetype === 'hunter' ? 1.6 : ensured.archetype === 'scavenger' ? 1 : 0)),
      1,
      20,
    ),
  }
  return applySenseOverrides(enforceDiet(normalized))
}

export function enforceDiet(dna: DNA): DNA {
  if (dna.archetype === 'hunter') {
    return {
      ...dna,
      preferredFood: ['prey'],
      scavengerAffinity: 0,
    }
  }
  if (dna.archetype === 'prey') {
    return {
      ...dna,
      preferredFood: ['plant'],
      scavengerAffinity: 0,
    }
  }
  return dna
}

export function deriveLandLocomotion(
  plan: BodyPlanGenes,
  archetype: Archetype,
  biome: Biome,
): LandLocomotionStats {
  const legs = plan.limbs.filter((limb): limb is LegGene => limb.kind === 'leg')
  if (biome !== 'land' || !legs.length) {
    return {
      strideLength: 0,
      legCount: 0,
      agility: 0.4,
    }
  }
  const totalLegs = legs.reduce((sum, leg) => sum + leg.count, 0)
  const avgSize =
    legs.reduce((sum, leg) => sum + leg.size * leg.count, 0) / Math.max(totalLegs, 1)
  const gait =
    legs.reduce((sum, leg) => sum + leg.gaitStyle * leg.count, 0) / Math.max(totalLegs, 1)
  const legCountFactor = clamp(0.75 + clamp01(totalLegs / 4) * 0.35, 0.5, 1.35)
  const strideLength = (0.45 + avgSize * 0.65) * (1 + gait * 0.2) * legCountFactor

  const tail = plan.appendages.find((appendage) => appendage.kind === 'tail')
  const tailCount = Math.max(0, Math.floor((tail as any)?.count ?? (tail ? 1 : 0)))
  const tailSize = tail && tail.kind === 'tail' ? tail.size : 0
  const tailBonus = tailCount <= 0 ? 0.75 : clamp(0.9 + tailSize * 0.25 + Math.min(tailCount, 3) * 0.08, 0.85, 1.35)

  const agility = clamp((0.3 + avgSize * 0.4 + gait * 0.2) * tailBonus, 0.15, 1.4)

  return {
    strideLength,
    legCount: totalLegs,
    agility,
  }
}

export function deriveSwimLocomotion(plan: BodyPlanGenes): SwimLocomotionStats | undefined {
  const fins = plan.appendages.filter((appendage) => appendage.kind === 'fin')
  const muscles = plan.appendages.filter((appendage) => appendage.kind === 'muscle-band')
  if (!fins.length && !muscles.length) return undefined

  const finCount = fins.reduce((sum, fin) => sum + fin.count, 0)
  const finSize =
    fins.reduce((sum, fin) => sum + fin.size * fin.count, 0) / Math.max(finCount, 1)
  const thrust = 0.5 + finSize * 0.6 + Math.min(finCount, 4) * 0.1
  const muscleFlex =
    muscles.reduce((sum, band) => sum + band.flexibility, 0) / Math.max(muscles.length, 1)
  const muscleDensity =
    muscles.reduce((sum, band) => sum + band.density, 0) / Math.max(muscles.length, 1)
  const turnRate = 0.4 + muscleFlex * 0.4 + finSize * 0.2
  const drift = 0.3 + (muscleDensity + finSize) * 0.3

  return {
    thrust,
    turnRate,
    drift,
  }
}

export function deriveFlightLocomotion(plan: BodyPlanGenes): FlightLocomotionStats | undefined {
  const wings = plan.limbs.filter((limb) => limb.kind === 'wing')
  if (!wings.length) return undefined
  const wing = wings[0]
  const lift = 0.6 + wing.span * 0.5 + wing.surface * 0.4
  const glide = 0.4 + wing.surface * 0.5 + wing.span * 0.2
  const takeoff = 0.3 + wing.articulation * 0.5
  return {
    lift,
    glide,
    takeoff,
  }
}

export function deriveMovementProfile(
  plan: BodyPlanGenes,
  archetype: Archetype,
  biome: Biome,
): MovementProfile {
  const profile: MovementProfile = {}
  if (featureFlags.landBodyPlan) {
    const land = deriveLandLocomotion(plan, archetype, biome)
    profile.land = land
  }
  if (featureFlags.aquaticBodyPlan) {
    const swim = deriveSwimLocomotion(plan)
    if (swim) {
      profile.water = swim
    }
  }
  if (featureFlags.aerialBodyPlan) {
    const flight = deriveFlightLocomotion(plan)
    if (flight) {
      profile.air = flight
    }
  }
  return profile
}
