import { Body, DNA, Energy, ModeState, Mood, Reproduction, Velocity } from '../components'
import type { SimulationContext } from '../types'

import type { ControlState } from '@/types/sim'
import { clamp } from '@/utils/math'
import { featureFlags } from '@/config/featureFlags'
import { deriveMovementProfile } from '@/ecs/bodyPlan'
import { SIM_YEAR_TICKS, effectiveFatBurnThreshold, levelFromAgeYears, maxMassForLevel } from '@/ecs/lifecycle'

const MODE = {
  Sleep: 1,
  Hunt: 3,
  Flee: 4,
  Mate: 5,
  Patrol: 6,
} as const

// The sim's current energy units were tuned for much shorter-lived agents.
// Scale metabolic drains down so agents can survive long enough to exhibit lifetime behavior.
const ENERGY_DRAIN_SCALE = 1 / 50

export function metabolismSystem(
  ctx: SimulationContext,
  dt: number,
  controls: ControlState,
): number[] {
  const fallen: number[] = []
  const speed = controls.speed ?? 1

  ctx.agents.forEach((entity, id) => {
    const mode = ModeState.mode[entity]
    const behaviorLocked = mode === MODE.Flee || mode === MODE.Mate
    const genome = ctx.genomes.get(id)
    const currentMass = clamp(Body.mass[entity] || genome?.bodyMass || (Energy.fatCapacity[entity] || 120) / 120, 0.2, 80)
    const birthTick = ctx.birthTick.get(id) ?? ctx.tick
    const yearTicks = Math.max(1, ctx.yearTicks || controls.yearTicks || SIM_YEAR_TICKS)
    const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
    const maturityAgeYears = clamp(genome?.maturityAgeYears ?? 1, 1, 20)
    const isMature = ageYears >= maturityAgeYears
    const level = levelFromAgeYears(ageYears)
    const targetMass = genome
      ? clamp(maxMassForLevel(genome.bodyMass, level, { maturityYears: controls.maturityYears ?? 6 }), 0.2, 80)
      : currentMass
    // Larger animals require more energy to maintain (basal metabolic scaling).
    const sizeMetabolicFactor = clamp(Math.pow(currentMass, 0.35), 0.6, 3.2)
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
      DNA.metabolism[entity] * stressLoad * hungerMultiplier * dt * speed * staminaFactor * 0.25 * sizeMetabolicFactor

    const senseDrain =
      featureFlags.sensesFromBodyPlan && DNA.senseUpkeep[entity]
        ? (DNA.senseUpkeep[entity] ?? 0) * dt * speed * 0.25 * sizeMetabolicFactor
        : 0
    let locomotionDrain = 0
    if (biome === 'water' && featureFlags.aquaticBodyPlan && profile?.water) {
      locomotionDrain = (profile.water.thrust + profile.water.turnRate) * dt * speed * 0.4 * sizeMetabolicFactor
    } else if (biome === 'air' && featureFlags.aerialBodyPlan && profile?.air) {
      locomotionDrain = (profile.air.lift + profile.air.takeoff * 0.5) * dt * speed * 0.4 * sizeMetabolicFactor
    }

    // Running / movement drain scaled by actual velocity
    const movementSpeed = Math.sqrt(Velocity.x[entity] * Velocity.x[entity] + Velocity.y[entity] * Velocity.y[entity])
    const runDrain =
      movementSpeed * dt * speed * (mode === MODE.Flee ? 0.35 : mode === MODE.Hunt ? 0.25 : 0.12)

    // Fat mass tax even while idle
    const fatRatio = Energy.fatCapacity[entity] > 0 ? Energy.fatStore[entity] / Energy.fatCapacity[entity] : 0
    const massPenalty = fatRatio * currentMass * dt * speed * 0.1

    // Pregnancy upkeep
    const isPregnant = ctx.pregnancies.has(id)
    const pregnancyCost = isPregnant ? (DNA.gestationCost[entity] ?? 5) * dt * speed * 0.3 : 0

    const totalDrain = burnRate + senseDrain + locomotionDrain + runDrain + massPenalty + pregnancyCost
    const scaledDrain = totalDrain * ENERGY_DRAIN_SCALE
    Energy.value[entity] -= scaledDrain

    // Fat-to-energy buffering while sleeping: only burn fat above the DNA threshold.
    // This wires `dna.fatBurnThreshold` (legacy: `store_using_threshold`) into the energy loop.
    if (mode === MODE.Sleep && genome) {
      const threshold = effectiveFatBurnThreshold(genome, currentMass, Energy.fatCapacity[entity])
      const availableFat = Math.max(0, Energy.fatStore[entity] - threshold)
      if (availableFat > 0) {
        const cover = Math.min(scaledDrain, availableFat)
        Energy.fatStore[entity] -= cover
        Energy.value[entity] += cover
      }
    }
    if (Energy.value[entity] < 0 && Energy.fatStore[entity] > 0) {
      const repay = Math.min(Energy.fatStore[entity], Math.abs(Energy.value[entity]))
      Energy.fatStore[entity] -= repay
      Energy.value[entity] += repay
    }

    // Grow body mass over time when well-fed: convert a portion of surplus energy/fat into lean mass
    // (phenotype) up to the level-based cap.
    if (genome && currentMass < targetMass) {
      const hungerLine =
        ((genome.hungerThreshold ?? Energy.metabolism[entity] * 8) + Energy.sleepDebt[entity]) *
        // Greedier animals keep higher reserves before turning surplus into growth.
        (0.95 + clamp(genome.eatingGreed ?? 0.5, 0, 1) * 0.35)
      const threshold = effectiveFatBurnThreshold(genome, currentMass, Energy.fatCapacity[entity])
      const fatAboveThreshold = Math.max(0, Energy.fatStore[entity] - threshold)
      const energySurplus = Energy.value[entity] - hungerLine
      if (energySurplus > 0 && fatAboveThreshold > 0) {
        const surplusFactor = clamp(energySurplus / Math.max(hungerLine, 1), 0, 2)
        const fatFactor = clamp(fatAboveThreshold / Math.max(Energy.fatCapacity[entity], 1), 0, 1)
        // Scale growth with target size but keep it slow/stable.
        const growthRate =
          (0.0015 + 0.008 * surplusFactor * fatFactor) *
          dt *
          clamp(targetMass, 0.5, 30) *
          // Growing in later years is slower.
          clamp(1.05 - level * 0.07, 0.5, 1.05)
        const nextMass = Math.min(targetMass, currentMass + growthRate)
        const massDelta = nextMass - currentMass
        if (massDelta > 0) {
          // Charge a small energy cost for building tissue (not a full thermodynamic model).
          const cost = massDelta * 35
          const fromEnergy = Math.min(Energy.value[entity], cost * 0.7)
          Energy.value[entity] -= fromEnergy
          const remaining = cost - fromEnergy
          const fromFat = Math.min(Math.max(0, Energy.fatStore[entity] - threshold), remaining)
          Energy.fatStore[entity] -= fromFat
          Body.mass[entity] = nextMass
        }
      }
    }

    // Hard clamp: mass should never exceed the level-based cap.
    if (genome && Body.mass[entity] > targetMass) {
      Body.mass[entity] = targetMass
    }

    // Burn fat in "bad times" (not just during sleep) to avoid hitting zero energy without searching.
    // Keep a small reserve under `fatBurnThreshold` so animals don't instantly consume all storage.
    if (mode !== MODE.Sleep && genome) {
      const hungerThreshold = genome?.hungerThreshold ?? Energy.metabolism[entity] * 8
      const hungerLine = hungerThreshold + Energy.sleepDebt[entity]
      const threshold = effectiveFatBurnThreshold(genome, currentMass, Energy.fatCapacity[entity])
      const availableFat = Math.max(0, Energy.fatStore[entity] - threshold)
      if (availableFat > 0 && Energy.value[entity] < hungerLine) {
        // Rate-limit conversion so fat is a buffer, not an always-on infinite energy source.
        const desired = Math.min(hungerLine - Energy.value[entity], scaledDrain * 2)
        const burn = Math.min(availableFat, desired)
        Energy.fatStore[entity] -= burn
        Energy.value[entity] += burn
      }
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

    if (!isMature) {
      Reproduction.libido[entity] = 0
    } else {
      const libidoGainRate = clamp(genome?.libidoGainRate ?? (DNA.fertility[entity] ?? 0.3) * 0.25, 0, 1)
      Reproduction.libido[entity] = clamp(Reproduction.libido[entity] + libidoGainRate * dt, 0, 1)
    }

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
