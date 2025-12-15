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
    const behaviorLocked = mode === MODE.Flee || mode === MODE.Mate
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
      DNA.metabolism[entity] * stressLoad * hungerMultiplier * dt * controls.speed * staminaFactor * 0.25

    const senseDrain =
      featureFlags.sensesFromBodyPlan && DNA.senseUpkeep[entity]
        ? (DNA.senseUpkeep[entity] ?? 0) * dt * 0.25
        : 0
    let locomotionDrain = 0
    if (biome === 'water' && featureFlags.aquaticBodyPlan && profile?.water) {
      locomotionDrain = (profile.water.thrust + profile.water.turnRate) * dt * 0.4
    } else if (biome === 'air' && featureFlags.aerialBodyPlan && profile?.air) {
      locomotionDrain = (profile.air.lift + profile.air.takeoff * 0.5) * dt * 0.4
    }

    // Running / movement drain scaled by actual velocity
    const speed = Math.sqrt(Velocity.x[entity] * Velocity.x[entity] + Velocity.y[entity] * Velocity.y[entity])
    const runDrain =
      speed * dt * (mode === MODE.Flee ? 0.35 : mode === MODE.Hunt ? 0.25 : 0.12)

    // Fat mass tax even while idle
    const fatRatio = Energy.fatCapacity[entity] > 0 ? Energy.fatStore[entity] / Energy.fatCapacity[entity] : 0
    const massPenalty = fatRatio * (genome?.bodyMass ?? 1) * dt * 0.1

    // Pregnancy upkeep
    const isPregnant = ctx.pregnancies.has(id)
    const pregnancyCost = isPregnant ? (DNA.gestationCost[entity] ?? 5) * dt * 0.3 : 0

    const totalDrain = burnRate + senseDrain + locomotionDrain + runDrain + massPenalty + pregnancyCost
    Energy.value[entity] -= totalDrain

    // Fat-to-energy buffering while sleeping: only burn fat above the DNA threshold.
    // This wires `dna.fatBurnThreshold` (legacy: `store_using_threshold`) into the energy loop.
    if (mode === MODE.Sleep && genome) {
      const threshold = clamp(genome.fatBurnThreshold ?? Energy.fatCapacity[entity] * 0.5, 0, Energy.fatCapacity[entity])
      const availableFat = Math.max(0, Energy.fatStore[entity] - threshold)
      if (availableFat > 0) {
        const cover = Math.min(totalDrain, availableFat)
        Energy.fatStore[entity] -= cover
        Energy.value[entity] += cover
      }
    }
    if (Energy.value[entity] < 0 && Energy.fatStore[entity] > 0) {
      const repay = Math.min(Energy.fatStore[entity], Math.abs(Energy.value[entity]))
      Energy.fatStore[entity] -= repay
      Energy.value[entity] += repay
    }

    if (Energy.value[entity] <= 0 && Energy.fatStore[entity] <= 0) {
      fallen.push(id)
      return
    }

    const hungerThreshold = genome?.hungerThreshold ?? Energy.metabolism[entity] * 8
    const hunger = Energy.value[entity] < hungerThreshold + Energy.sleepDebt[entity]
    const wantsRest = Energy.value[entity] > hungerThreshold * 1.5

    if (hunger && !behaviorLocked) {
      Mood.focus[entity] = clamp(Mood.focus[entity] + 0.4 * dt, 0, 1)
      Mood.stress[entity] = clamp(Mood.stress[entity] + 0.35 * dt)
    } else if (wantsRest && !behaviorLocked) {
      Mood.stress[entity] = clamp(Mood.stress[entity] - 0.5 * dt)
      Mood.focus[entity] = clamp(Mood.focus[entity] - 0.2 * dt)
    } else if (!behaviorLocked) {
      Mood.focus[entity] = clamp(Mood.focus[entity] - 0.1 * dt)
    }

    Mood.social[entity] = clamp(Mood.social[entity] + (ctx.rng() - 0.5) * 0.02)
    ModeState.gestationTimer[entity] = Math.max(0, ModeState.gestationTimer[entity] - dt)
    if (ModeState.dangerTimer[entity] > 0) {
      ModeState.dangerTimer[entity] = Math.max(0, ModeState.dangerTimer[entity] - dt)
    }
    if (ModeState.sexCooldown[entity] > 0) {
      ModeState.sexCooldown[entity] = Math.max(0, ModeState.sexCooldown[entity] - dt)
    }

    const libidoGainRate = clamp(genome?.libidoGainRate ?? (DNA.fertility[entity] ?? 0.3) * 0.25, 0, 1)
    Reproduction.libido[entity] = clamp(Reproduction.libido[entity] + libidoGainRate * dt, 0, 1)

    if (mode === MODE.Sleep) {
      const recovery = (DNA.sleepEfficiency[entity] ?? 0.8) * dt
      Energy.sleepDebt[entity] = Math.max(0, Energy.sleepDebt[entity] - recovery)
      Mood.fatigue[entity] = clamp(Mood.fatigue[entity] - recovery * 0.4, 0, 1)
    } else {
      const debtGain = dt / Math.max(DNA.stamina[entity] ?? 1, 0.5)
      Energy.sleepDebt[entity] = Math.min(5, Energy.sleepDebt[entity] + debtGain)
      Mood.fatigue[entity] = clamp(Mood.fatigue[entity] + debtGain * 0.2, 0, 1)
    }
  })

  return fallen
}
