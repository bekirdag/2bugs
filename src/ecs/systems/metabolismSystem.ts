import { DNA, Energy, ModeState, Mood, Reproduction, Velocity } from '../components'
import type { SimulationContext } from '../types'

import type { ControlState } from '@/types/sim'
import { clamp } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'
import { deriveMovementProfile } from '@/ecs/bodyPlan'

const MODE = {
  Sleep: 1,
  Hunt: 3,
  Flee: 4,
  Mate: 5,
  Patrol: 6,
} as const

export function metabolismSystem(
  ctx: SimulationContext,
  dt: number,
  controls: ControlState,
): number[] {
  const fallen: number[] = []

  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    const genome = ctx.genomes.get(id)
    let profile = ctx.locomotion.get(id)
    if (!profile && genome) {
      profile = deriveMovementProfile(genome.bodyPlan, genome.archetype, genome.biome ?? 'land')
      ctx.locomotion.set(id, profile)
    }
    const biome = genome?.biome ?? 'land'
    const stressLoad = 1 + Mood.stress[entity] * 0.25
    const hungerMultiplier = mode === MODE.Hunt ? 1.35 : mode === MODE.Flee ? 1.7 : 1
    const staminaFactor = 1 / Math.max(DNA.stamina[entity] ?? 1, 0.4)
    const burnRate =
      DNA.metabolism[entity] * stressLoad * hungerMultiplier * dt * controls.speed * staminaFactor

    const senseDrain =
      featureFlags.sensesFromBodyPlan && DNA.senseUpkeep[entity]
        ? (DNA.senseUpkeep[entity] ?? 0) * dt
        : 0
    let locomotionDrain = 0
    if (biome === 'water' && featureFlags.aquaticBodyPlan && profile?.water) {
      locomotionDrain = (profile.water.thrust + profile.water.turnRate) * dt
    } else if (biome === 'air' && featureFlags.aerialBodyPlan && profile?.air) {
      locomotionDrain = (profile.air.lift + profile.air.takeoff * 0.5) * dt
    }

    // Running / movement drain scaled by actual velocity
    const speed = Math.sqrt(Velocity.x[entity] * Velocity.x[entity] + Velocity.y[entity] * Velocity.y[entity])
    const runDrain =
      speed * dt * (mode === MODE.Flee ? 1.2 : mode === MODE.Hunt ? 0.9 : 0.4)

    // Fat mass tax even while idle
    const fatRatio = Energy.fatCapacity[entity] > 0 ? Energy.fatStore[entity] / Energy.fatCapacity[entity] : 0
    const massPenalty = fatRatio * (genome?.bodyMass ?? 1) * dt * 0.4

    // Pregnancy upkeep
    const isPregnant = ctx.pregnancies.has(id)
    const pregnancyCost = isPregnant ? (DNA.gestationCost[entity] ?? 5) * dt * 0.6 : 0

    Energy.value[entity] -= burnRate + senseDrain + locomotionDrain + runDrain + massPenalty + pregnancyCost
    if (Energy.value[entity] < 0 && Energy.fatStore[entity] > 0) {
      const repay = Math.min(Energy.fatStore[entity], Math.abs(Energy.value[entity]))
      Energy.fatStore[entity] -= repay
      Energy.value[entity] += repay
    }

    if (Energy.value[entity] <= 0 && Energy.fatStore[entity] <= 0) {
      fallen.push(id)
      return
    }

    const hunger = Energy.value[entity] < Energy.metabolism[entity] * 8 + Energy.sleepDebt[entity]
    const wantsRest = Energy.value[entity] > Energy.metabolism[entity] * 12

    if (hunger) {
      ModeState.mode[entity] = MODE.Hunt
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.4 * dt, 0, 1)
      Mood.stress[entity] = clamp(Mood.stress[entity] + 0.35 * dt)
    } else if (mode === MODE.Hunt && wantsRest) {
      ModeState.mode[entity] = MODE.Sleep
      Mood.stress[entity] = clamp(Mood.stress[entity] - 0.5 * dt)
      Mood.focus[entity] = clamp(Mood.focus[entity] - 0.2 * dt)
    } else if (!hunger && mode !== MODE.Flee) {
      ModeState.mode[entity] = MODE.Patrol
      Mood.focus[entity] = clamp(Mood.focus[entity] - 0.1 * dt)
    }

    Mood.social[entity] = clamp(Mood.social[entity] + (ctx.rng() - 0.5) * 0.02)
    ModeState.gestationTimer[entity] = Math.max(0, ModeState.gestationTimer[entity] - dt)
    if (ModeState.dangerTimer[entity] > 0) {
      ModeState.dangerTimer[entity] = Math.max(0, ModeState.dangerTimer[entity] - dt)
      if (ModeState.dangerTimer[entity] <= 0 && ModeState.mode[entity] === MODE.Flee) {
        ModeState.mode[entity] = MODE.Patrol
      }
    }
    if (ModeState.sexCooldown[entity] > 0) {
      ModeState.sexCooldown[entity] = Math.max(0, ModeState.sexCooldown[entity] - dt)
    }

    Reproduction.libido[entity] = clamp(
      Reproduction.libido[entity] + DNA.fertility[entity] * 0.25 * dt,
      0,
      1,
    )

    if (mode === MODE.Sleep) {
      const recovery = (DNA.sleepEfficiency[entity] ?? 0.8) * dt
      Energy.sleepDebt[entity] = Math.max(0, Energy.sleepDebt[entity] - recovery)
      Mood.fatigue[entity] = clamp(Mood.fatigue[entity] - recovery * 0.4, 0, 1)
    } else {
      const debtGain = dt / Math.max(DNA.stamina[entity] ?? 1, 0.5)
      Energy.sleepDebt[entity] = Math.min(5, Energy.sleepDebt[entity] + debtGain)
      Mood.fatigue[entity] = clamp(Mood.fatigue[entity] + debtGain * 0.2, 0, 1)
      if (Energy.sleepDebt[entity] > 2.5) {
        ModeState.mode[entity] = MODE.Sleep
      }
    }
  })

  return fallen
}
