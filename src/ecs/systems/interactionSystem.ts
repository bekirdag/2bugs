import { AgentMeta, Body, Corpse, DNA, Energy, Intent, ModeState, PlantStats, Position, ArchetypeCode } from '../components'
import type { SimulationContext } from '../types'

import { applyFoodIntake, eatingGreed } from '@/ecs/nutrition'

const CONTACT_DISTANCE = 18
const MODE = {
  Graze: 2,
  Hunt: 3,
  Mate: 5,
  Fight: 7,
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
    if (ModeState.mode[entity] === MODE.Mate) return
    const targetType = ModeState.targetType[entity]
    const targetId = ModeState.targetId[entity]
    if (!targetType || !targetId) return

    const targetPos = resolveTargetPosition(ctx, targetType, targetId)
    if (!targetPos) return

    const dx = Position.x[entity] - targetPos.x
    const dy = Position.y[entity] - targetPos.y
    const gap = Math.sqrt(dx * dx + dy * dy)
    if (targetType === 3) {
      const corpseEntity = ctx.corpses.get(targetId)
      if (corpseEntity === undefined) return
      const contactDistance = CONTACT_DISTANCE + clamp(Corpse.radius[corpseEntity] * 0.35, 0, 120)
      if (gap > contactDistance) return
    } else if (gap > CONTACT_DISTANCE) {
      return
    }

    if ((ModeState.mode[entity] === MODE.Hunt || ModeState.mode[entity] === MODE.Fight) && targetType === 1) {
      // Scavengers are corpse-only; never attack live animals.
      if (AgentMeta.archetype[entity] === ArchetypeCode.Scavenger) return
      handleDuel(ctx, entity, id, targetId, hooks, aggressionBias)
    } else if (ModeState.mode[entity] === MODE.Graze && targetType === 2) {
      handleGrazing(ctx, entity, id, targetId, hooks, nutrition)
    } else if (ModeState.mode[entity] === MODE.Hunt && targetType === 3) {
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

  // Decide initiative: size + aggression determine who tends to land first contact.
  const attackerMass = bodyMass(ctx, attackerEntity)
  const defenderMass = bodyMass(ctx, defenderEntity)
  const attackerSizeFactor = attackerMass / Math.max(attackerMass + defenderMass, 0.001)
  const defenderSizeFactor = defenderMass / Math.max(attackerMass + defenderMass, 0.001)
  const attackerInit =
    (DNA.aggression[attackerEntity] ?? 0.5) * 0.55 +
    attackerSizeFactor * 0.55 +
    ctx.rng() * 0.25 +
    aggressionBias * 0.5
  const defenderInit =
    (DNA.aggression[defenderEntity] ?? 0.4) * 0.55 +
    defenderSizeFactor * 0.55 +
    ctx.rng() * 0.25

  const first = attackerInit >= defenderInit ? attackerEntity : defenderEntity
  const second = first === attackerEntity ? defenderEntity : attackerEntity

  let winner = first
  let loser = second

  for (let i = 0; i < 4; i++) {
    const ended = resolveStrike(ctx, winner, loser)
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
    }
  }
}

function resolveStrike(
  ctx: SimulationContext,
  attacker: number,
  defender: number,
): boolean {
  // Strength is defined solely by size. This ensures extreme size mismatches are effectively unwinnable
  // for the smaller animal (e.g., size 1 vs size 10 -> near-zero damage from the smaller side).
  const attackerMass = bodyMass(ctx, attacker)
  const defenderMass = bodyMass(ctx, defender)
  const ratio = attackerMass / Math.max(defenderMass, 0.001)
  const leverage = Math.pow(ratio, 4)
  const variability = 0.85 + ctx.rng() * 0.3
  const baseDamage = 10
  const damage = Math.min(220, baseDamage * leverage * variability)

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

  const greed = eatingGreed(ctx, preyId)
  const bite = clamp(0.35 + greed * 0.9, 0.2, 1.4)
  PlantStats.biomass[plantEntity] -= bite
  PlantStats.moisture[plantEntity] = Math.max(0, PlantStats.moisture[plantEntity] - bite * 0.35)
  const energyGain = bite * PlantStats.nutrientDensity[plantEntity] * 120
  applyFoodIntake(ctx, preyEntity, preyId, energyGain, nutrition)

  if (PlantStats.biomass[plantEntity] <= 0.1) {
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

  const greed = eatingGreed(ctx, eaterId)
  const mass = bodyMass(ctx, eaterEntity)
  const bite = clamp((14 + mass * 6) * (0.55 + greed), 8, 220)
  const available = Math.max(0, Corpse.nutrients[corpseEntity] || 0)
  if (available <= 0.1) {
    hooks.removeCorpse(corpseId)
    return
  }
  const consumed = Math.min(available, bite)
  Corpse.nutrients[corpseEntity] = available - consumed

  applyFoodIntake(ctx, eaterEntity, eaterId, consumed, nutrition)

  // If the corpse is depleted, remove it.
  if (Corpse.nutrients[corpseEntity] <= 0.1) {
    hooks.removeCorpse(corpseId)
  } else {
    // Keep feeding focus if still hungry.
    const hungerLine = (ctx.genomes.get(eaterId)?.hungerThreshold ?? Energy.metabolism[eaterEntity] * 8) * 1.25
    if (Energy.value[eaterEntity] < hungerLine) {
      Intent.mode[eaterEntity] = MODE.Hunt
      Intent.targetType[eaterEntity] = 3
      Intent.targetId[eaterEntity] = corpseId
    }
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
