import { AgentMeta, DNA, Energy, ModeState, PlantStats, Position } from '../components'
import type { SimulationContext } from '../types'

const CONTACT_DISTANCE = 18
const MODE = {
  Graze: 2,
  Hunt: 3,
  Mate: 5,
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
    if (!targetPos) {
      ModeState.targetType[entity] = 0
      ModeState.targetId[entity] = 0
      return
    }

    const dx = Position.x[entity] - targetPos.x
    const dy = Position.y[entity] - targetPos.y
    const gap = Math.sqrt(dx * dx + dy * dy)
    if (gap > CONTACT_DISTANCE) return

    if (ModeState.mode[entity] === MODE.Hunt && targetType === 1) {
      handlePredation(ctx, entity, targetId, hooks, aggressionBias)
    } else if (ModeState.mode[entity] === MODE.Graze && targetType === 2) {
      handleGrazing(ctx, entity, targetId, hooks)
    }
  })
}

function handlePredation(
  ctx: SimulationContext,
  hunterEntity: number,
  preyId: number,
  hooks: InteractionHooks,
  aggressionBias: number,
) {
  const preyEntity = ctx.agents.get(preyId)
  if (preyEntity === undefined) {
    ModeState.targetType[hunterEntity] = 0
    ModeState.targetId[hunterEntity] = 0
    return
  }

  const aggressionGene = (DNA.aggression[hunterEntity] ?? 0.5) + aggressionBias
  const aggression = Math.max(0.5, aggressionGene * 0.5 + 1)
  const stamina = Math.max(0.8, DNA.stamina ? DNA.stamina[hunterEntity] ?? 1 : 1)
  const fear = (DNA.fear[preyEntity] ?? 0.3) * 0.5 + 0.8
  const hunterRoll =
    (DNA.baseSpeed[hunterEntity] + Energy.value[hunterEntity] * 0.8) *
    (0.8 + ctx.rng() * 0.4) *
    aggression *
    stamina
  const preyRoll =
    (DNA.baseSpeed[preyEntity] + Energy.value[preyEntity] * 0.5) *
    (0.8 + ctx.rng() * 0.4) *
    fear

  if (hunterRoll >= preyRoll) {
    const energyGain = Math.max(Energy.value[preyEntity] * 0.6, 10)
    const fatGain = Math.max(Energy.fatStore[preyEntity] * 0.5, 5)
    ctx.lootSites.push({
      x: Position.x[preyEntity],
      y: Position.y[preyEntity],
      nutrients: energyGain * 0.5 + fatGain,
      decay: 8,
    })
    Energy.value[hunterEntity] += energyGain
    Energy.fatStore[hunterEntity] = Math.min(
      Energy.fatCapacity[hunterEntity],
      Energy.fatStore[hunterEntity] + fatGain,
    )
    ModeState.mode[hunterEntity] = MODE.Graze
    ModeState.targetType[hunterEntity] = 0
    ModeState.targetId[hunterEntity] = 0

    hooks.removeAgent(preyId)
  } else {
    const backlash = hunterRoll * 0.12 * aggression
    Energy.value[hunterEntity] -= backlash
    ModeState.mode[hunterEntity] = MODE.Graze
    ModeState.targetType[hunterEntity] = 0
    ModeState.targetId[hunterEntity] = 0
    if (Energy.value[hunterEntity] <= 0) {
      hooks.removeAgent(AgentMeta.id[hunterEntity])
    }
  }
}

function handleGrazing(ctx: SimulationContext, preyEntity: number, plantId: number, hooks: InteractionHooks) {
  const plantEntity = ctx.plants.get(plantId)
  if (plantEntity === undefined) {
    ModeState.targetType[preyEntity] = 0
    ModeState.targetId[preyEntity] = 0
    return
  }

  const bite = 0.5
  PlantStats.biomass[plantEntity] -= bite
  PlantStats.moisture[plantEntity] = Math.max(0, PlantStats.moisture[plantEntity] - bite * 0.35)
  const energyGain = bite * PlantStats.nutrientDensity[plantEntity] * 40
  Energy.value[preyEntity] += energyGain
  ModeState.mode[preyEntity] = MODE.Graze
  ModeState.targetType[preyEntity] = 0
  ModeState.targetId[preyEntity] = 0
  Energy.fatStore[preyEntity] = Math.min(
    Energy.fatCapacity[preyEntity],
    Energy.fatStore[preyEntity] + energyGain * 0.25,
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
