import { AgentMeta, DNA, Energy, ModeState, PlantStats, Position } from '../components'
import type { SimulationContext } from '../types'

const CONTACT_DISTANCE = 18
const MODE = {
  Graze: 2,
  Hunt: 3,
  Mate: 5,
  Fight: 7,
} as const

export interface InteractionHooks {
  removeAgent(id: number): void
  removePlant(id: number): void
}

export function interactionSystem(ctx: SimulationContext, hooks: InteractionHooks, aggressionBias = 0) {
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
    if (gap > CONTACT_DISTANCE) return

    if ((ModeState.mode[entity] === MODE.Hunt || ModeState.mode[entity] === MODE.Fight) && targetType === 1) {
      handleDuel(ctx, entity, id, targetId, hooks, aggressionBias)
    } else if (ModeState.mode[entity] === MODE.Graze && targetType === 2) {
      handleGrazing(ctx, entity, targetId, hooks)
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

  // Decide initiative: higher aggression + power gets first strike
  const attackerInit =
    (DNA.aggression[attackerEntity] ?? 0.5) * 0.6 +
    ((attackerGenome?.power ?? 50) / 200) +
    ctx.rng() * 0.4 +
    aggressionBias * 0.5
  const defenderInit =
    (DNA.aggression[defenderEntity] ?? 0.4) * 0.6 +
    ((defenderGenome?.power ?? 40) / 220) +
    ctx.rng() * 0.4

  const first = attackerInit >= defenderInit ? attackerEntity : defenderEntity
  const second = first === attackerEntity ? defenderEntity : attackerEntity

  let winner = first
  let loser = second

  for (let i = 0; i < 4; i++) {
    const ended = resolveStrike(ctx, winner, loser, attackerGenome, defenderGenome)
    if (ended) break
    ;[winner, loser] = [loser, winner]
  }

  if (Energy.value[loser] <= 0 && Energy.fatStore[loser] <= 0) {
    // Winner gains spoils if carnivore
    const loserId = AgentMeta.id[loser]
    const energyGain = Math.max(Energy.value[loser] * 1.2, 40)
    const fatGain = Math.max(Energy.fatStore[loser] * 0.8, 20)
    ctx.lootSites.push({
      x: Position.x[loser],
      y: Position.y[loser],
      nutrients: energyGain * 0.5 + fatGain,
      decay: 8,
    })
    Energy.value[winner] += energyGain
    Energy.fatStore[winner] = Math.min(Energy.fatCapacity[winner], Energy.fatStore[winner] + fatGain)
    hooks.removeAgent(loserId)
  }
}

function resolveStrike(
  ctx: SimulationContext,
  attacker: number,
  defender: number,
  attackerGenome?: any,
  defenderGenome?: any,
): boolean {
  const powerGene = attackerGenome?.power ?? 50
  const defenceGene = defenderGenome?.defence ?? 40
  const staminaGene = attackerGenome?.stamina ?? DNA.stamina?.[attacker] ?? 1
  const aggression = DNA.aggression[attacker] ?? 0.5
  const power = Math.max(0.6, powerGene / 80)
  const defence = Math.max(0.2, defenceGene / 120)
  const stamina = Math.max(0.6, staminaGene)
  const hit = power * (1 + aggression * 0.6) * (0.8 + ctx.rng() * 0.6) * (0.9 + stamina * 0.2)
  const damage = hit * (1 - defence * 0.45)

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

function handleGrazing(ctx: SimulationContext, preyEntity: number, plantId: number, hooks: InteractionHooks) {
  const plantEntity = ctx.plants.get(plantId)
  if (plantEntity === undefined) return

  const bite = 0.5
  PlantStats.biomass[plantEntity] -= bite
  PlantStats.moisture[plantEntity] = Math.max(0, PlantStats.moisture[plantEntity] - bite * 0.35)
  const energyGain = bite * PlantStats.nutrientDensity[plantEntity] * 120
  Energy.value[preyEntity] += energyGain
  Energy.fatStore[preyEntity] = Math.min(
    Energy.fatCapacity[preyEntity],
    Energy.fatStore[preyEntity] + energyGain * 0.4,
  )

  if (PlantStats.biomass[plantEntity] <= 0.1) {
    hooks.removePlant(plantId)
  }
}

function resolveTargetPosition(ctx: SimulationContext, type: number, id: number) {
  if (type === 1) {
    const targetEntity = ctx.agents.get(id)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  } else {
    const targetEntity = ctx.plants.get(id)
    if (targetEntity === undefined) return null
    return { x: Position.x[targetEntity], y: Position.y[targetEntity] }
  }
}
