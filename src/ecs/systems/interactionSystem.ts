import { AgentMeta, Body, Corpse, DNA, Energy, Intent, ModeState, PlantStats, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'
import type { DNA as DNAState } from '@/types/sim'

import { applyFoodIntake, eatingGreed } from '@/ecs/nutrition'
import { corpseEdibleByStage } from '@/ecs/corpseStages'

const MODE = {
  Graze: 2,
  Hunt: 3,
  Mate: 5,
  Fight: 7,
  Patrol: 6,
} as const

export interface InteractionHooks {
  killAgent(id: number): number | null
  removePlant(id: number): void
  removeCorpse(id: number): void
}

export function interactionSystem(
  ctx: SimulationContext,
  hooks: InteractionHooks,
  aggressionBias = 0,
  nutrition?: { maturityYears?: number; satiationMultiplier?: number; massBuildCost?: number },
) {
  ctx.agents.forEach((entity, id) => {
    const genome = ctx.genomes.get(id)
    if (!genome) return
    if (ModeState.mode[entity] === MODE.Mate) return
    const targetType = ModeState.targetType[entity]
    const targetId = ModeState.targetId[entity]
    if (!targetType || !targetId) return

    const targetPos = resolveTargetPosition(ctx, targetType, targetId)
    if (!targetPos) return

    const dx = Position.x[entity] - targetPos.x
    const dy = Position.y[entity] - targetPos.y
    const gap = Math.sqrt(dx * dx + dy * dy)
    const contactDistance = eatingContactDistance(ctx, entity, id)
    if (targetType === 3) {
      const corpseEntity = ctx.corpses.get(targetId)
      if (corpseEntity === undefined) return
      const corpseReach =
        contactDistance +
        clamp(
          Corpse.radius[corpseEntity] * genome.huntCorpseReachScale,
          genome.huntCorpseReachMin,
          genome.huntCorpseReachMax,
        )
      if (gap > corpseReach) return
    } else if (gap > contactDistance) {
      return
    }

    if ((ModeState.mode[entity] === MODE.Hunt || ModeState.mode[entity] === MODE.Fight) && targetType === 1) {
      // Scavengers are corpse-only; never attack live animals.
      if (AgentMeta.archetype[entity] === ArchetypeCode.Scavenger) return
      handleDuel(ctx, entity, id, targetId, hooks, aggressionBias)
    } else if (ModeState.mode[entity] === MODE.Graze && targetType === 2) {
      handleGrazing(ctx, entity, id, targetId, hooks, nutrition)
    } else if ((ModeState.mode[entity] === MODE.Hunt || ModeState.mode[entity] === MODE.Fight) && targetType === 3) {
      handleScavenging(ctx, entity, id, targetId, hooks, nutrition)
    }
  })
}

function handleDuel(
  ctx: SimulationContext,
  attackerEntity: number,
  attackerId: number,
  defenderId: number,
  hooks: InteractionHooks,
  aggressionBias: number,
) {
  const defenderEntity = ctx.agents.get(defenderId)
  if (defenderEntity === undefined) return
  const attackerGenome = ctx.genomes.get(attackerId)
  const defenderGenome = ctx.genomes.get(defenderId)
  if (!attackerGenome || !defenderGenome) return

  // Decide initiative: size + aggression determine who tends to land first contact.
  const attackerMass = bodyMass(ctx, attackerEntity)
  const defenderMass = bodyMass(ctx, defenderEntity)
  const attackerSizeFactor = attackerMass / Math.max(attackerMass + defenderMass, 0.001)
  const defenderSizeFactor = defenderMass / Math.max(attackerMass + defenderMass, 0.001)
  const attackerInit =
    attackerGenome.aggression * attackerGenome.fightInitiativeAggressionWeight +
    attackerSizeFactor * attackerGenome.fightInitiativeSizeWeight +
    ctx.rng() * attackerGenome.fightInitiativeRandomWeight +
    aggressionBias * attackerGenome.fightInitiativeBiasWeight
  const defenderInit =
    defenderGenome.aggression * defenderGenome.fightInitiativeAggressionWeight +
    defenderSizeFactor * defenderGenome.fightInitiativeSizeWeight +
    ctx.rng() * defenderGenome.fightInitiativeRandomWeight

  const first = attackerInit >= defenderInit ? attackerEntity : defenderEntity
  const second = first === attackerEntity ? defenderEntity : attackerEntity

  let winner = first
  let loser = second

  const exchangeCount = Math.max(
    1,
    Math.round((attackerGenome.fightExchangeCount + defenderGenome.fightExchangeCount) / 2),
  )
  for (let i = 0; i < exchangeCount; i++) {
    const winnerGenome = winner === attackerEntity ? attackerGenome : defenderGenome
    const ended = resolveStrike(ctx, winner, loser, winnerGenome)
    if (ended) break
    ;[winner, loser] = [loser, winner]
  }

  if (Energy.value[loser] <= 0 && Energy.fatStore[loser] <= 0) {
    const loserId = AgentMeta.id[loser]
    const corpseId = hooks.killAgent(loserId)
    if (corpseId !== null) {
      // Keep the winner engaged: target the corpse so it can feed.
      Intent.mode[winner] = MODE.Hunt
      Intent.targetType[winner] = 3
      Intent.targetId[winner] = corpseId
      ModeState.mode[winner] = MODE.Hunt
      ModeState.targetType[winner] = 3
      ModeState.targetId[winner] = corpseId
    }
  }
}

function resolveStrike(
  ctx: SimulationContext,
  attacker: number,
  defender: number,
  attackerGenome: DNAState,
): boolean {
  // Strength is defined solely by size. This ensures extreme size mismatches are effectively unwinnable
  // for the smaller animal (e.g., size 1 vs size 10 -> near-zero damage from the smaller side).
  const attackerMass = bodyMass(ctx, attacker)
  const defenderMass = bodyMass(ctx, defender)
  const ratio = attackerMass / Math.max(defenderMass, 0.001)
  const leverage = Math.pow(ratio, attackerGenome.fightLeverageExponent)
  const variability = attackerGenome.fightVariabilityBase + ctx.rng() * attackerGenome.fightVariabilityScale
  const damage = Math.min(
    attackerGenome.fightDamageCap,
    attackerGenome.fightBaseDamage * leverage * variability,
  )

  // Apply to energy first, then fat reserve as buffer
  const energyBefore = Energy.value[defender]
  const fatBefore = Energy.fatStore[defender]
  const combined = energyBefore + fatBefore
  const remaining = combined - damage
  if (remaining <= 0) {
    Energy.value[defender] = 0
    Energy.fatStore[defender] = 0
    return true
  }
  Energy.value[defender] = Math.max(0, energyBefore - damage)
  if (Energy.value[defender] === 0) {
    Energy.fatStore[defender] = Math.max(0, fatBefore - (damage - energyBefore))
  }
  return false
}

function bodyMass(ctx: SimulationContext, entity: number) {
  const id = AgentMeta.id[entity]
  const genome = ctx.genomes.get(id)
  const current = Body.mass[entity]
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) return current
  const mass = genome?.bodyMass
  if (typeof mass === 'number' && Number.isFinite(mass) && mass > 0) return mass
  // Fallback: approximate mass from fat capacity if genome missing.
  const fallback = (Energy.fatCapacity[entity] || 100) / 100
  return Math.max(0.2, fallback)
}

function handleGrazing(
  ctx: SimulationContext,
  preyEntity: number,
  preyId: number,
  plantId: number,
  hooks: InteractionHooks,
  nutrition?: { maturityYears?: number; satiationMultiplier?: number; massBuildCost?: number },
) {
  const plantEntity = ctx.plants.get(plantId)
  if (plantEntity === undefined) return
  const genome = ctx.genomes.get(preyId)
  if (!genome) return

  const greed = eatingGreed(ctx, preyId)
  const bite = clamp(
    genome.grazeBiteBase + greed * genome.grazeBiteGreedScale,
    genome.grazeBiteMin,
    genome.grazeBiteMax,
  )
  const available = Math.max(0, PlantStats.biomass[plantEntity] || 0)
  if (available <= genome.grazeMinBiomass) {
    hooks.removePlant(plantId)
    return
  }
  const consumed = Math.min(available, bite)
  PlantStats.biomass[plantEntity] = Math.max(0, available - consumed)
  PlantStats.moisture[plantEntity] = Math.max(
    0,
    PlantStats.moisture[plantEntity] - consumed * genome.grazeMoistureLoss,
  )
  const energyGain = consumed * PlantStats.nutrientDensity[plantEntity] * genome.grazeEnergyMultiplier
  applyFoodIntake(ctx, preyEntity, preyId, energyGain, nutrition)

  if (PlantStats.biomass[plantEntity] <= genome.grazeRemoveBiomass) {
    hooks.removePlant(plantId)
  }
}

function handleScavenging(
  ctx: SimulationContext,
  eaterEntity: number,
  eaterId: number,
  corpseId: number,
  hooks: InteractionHooks,
  nutrition?: { maturityYears?: number; satiationMultiplier?: number; massBuildCost?: number },
) {
  const corpseEntity = ctx.corpses.get(corpseId)
  if (corpseEntity === undefined) return
  const genome = ctx.genomes.get(eaterId)
  if (!genome) return
  const archetype =
    AgentMeta.archetype[eaterEntity] === ArchetypeCode.Scavenger
      ? 'scavenger'
      : AgentMeta.archetype[eaterEntity] === ArchetypeCode.Hunter
        ? 'hunter'
        : 'prey'
  const cannibalism = genome.cannibalism
  const corpseArchetype = decodeArchetypeCode(Corpse.archetype[corpseEntity])
  if (!corpseEdibleByStage(Corpse.stage[corpseEntity], archetype, corpseArchetype, cannibalism)) {
    if (ModeState.targetType[eaterEntity] === 3 && ModeState.targetId[eaterEntity] === corpseId) {
      ModeState.targetType[eaterEntity] = 0
      ModeState.targetId[eaterEntity] = 0
      Intent.targetType[eaterEntity] = 0
      Intent.targetId[eaterEntity] = 0
      if (ModeState.mode[eaterEntity] === MODE.Hunt) {
        ModeState.mode[eaterEntity] = MODE.Patrol
        Intent.mode[eaterEntity] = MODE.Patrol
      }
    }
    return
  }

  const greed = eatingGreed(ctx, eaterId)
  const mass = bodyMass(ctx, eaterEntity)
  const bite = clamp(
    (genome.scavengeBiteBase + mass * genome.scavengeBiteMassScale) * (genome.scavengeBiteGreedBase + greed),
    genome.scavengeBiteMin,
    genome.scavengeBiteMax,
  )
  const available = Math.max(0, Corpse.nutrients[corpseEntity] || 0)
  if (available <= genome.scavengeMinNutrients) {
    hooks.removeCorpse(corpseId)
    return
  }
  const consumed = Math.min(available, bite)
  Corpse.nutrients[corpseEntity] = available - consumed

  applyFoodIntake(ctx, eaterEntity, eaterId, consumed, nutrition)

  // If the corpse is depleted, remove it.
  if (Corpse.nutrients[corpseEntity] <= genome.scavengeMinNutrients) {
    hooks.removeCorpse(corpseId)
  } else {
    // Keep feeding focus if still hungry.
    const keepEatingMultiplier = clamp(genome.keepEatingMultiplier, 0.8, 2)
    const hungerLine = genome.hungerThreshold * keepEatingMultiplier
    if (Energy.value[eaterEntity] < hungerLine) {
      Intent.mode[eaterEntity] = MODE.Hunt
      Intent.targetType[eaterEntity] = 3
      Intent.targetId[eaterEntity] = corpseId
    }
  }
}

function decodeArchetypeCode(code: number | undefined): 'hunter' | 'prey' | 'scavenger' | undefined {
  switch (code) {
    case ArchetypeCode.Hunter:
      return 'hunter'
    case ArchetypeCode.Scavenger:
      return 'scavenger'
    case ArchetypeCode.Prey:
      return 'prey'
    default:
      return undefined
  }
}

function resolveTargetPosition(ctx: SimulationContext, type: number, id: number) {
  if (type === 1) {
    const targetEntity = ctx.agents.get(id)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else if (type === 2) {
    const targetEntity = ctx.plants.get(id)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else if (type === 3) {
    const targetEntity = ctx.corpses.get(id)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function eatingContactDistance(ctx: SimulationContext, entity: number, id: number) {
  const genome = ctx.genomes.get(id)
  const senses = genome?.bodyPlan?.senses ?? []
  let eyeCount = 0
  let noseCount = 0
  let noseAcuitySum = 0

  senses.forEach((sense) => {
    if (sense.count <= 0) return
    if (sense.sense === 'eye') {
      eyeCount += sense.count
    } else if (sense.sense === 'nose') {
      noseCount += sense.count
      noseAcuitySum += sense.acuity * sense.count
    }
  })

  const visionGene = DNA.visionRange[entity] || genome?.visionRange || 180
  const awareness = DNA.awareness[entity] ?? genome?.awareness ?? clamp(visionGene / 360, 0.2, 1)
  const visualRange = eyeCount > 0 ? visionGene * (1 + (awareness - 0.5) * 0.6) : 0
  const avgNoseAcuity = noseCount > 0 ? noseAcuitySum / noseCount : 0.5
  const awarenessFactor = 0.85 + clamp(awareness, 0, 1) * 0.3
  const smellRange =
    noseCount <= 0
      ? 0
      : clamp((60 + noseCount * 50 * (0.65 + avgNoseAcuity * 0.7)) * awarenessFactor, 24, 420)

  const reach = 12 + visualRange * 0.03 + smellRange * 0.035
  return clamp(reach, 12, 64)
}
