import { Body, Digestion, Energy } from './components'
import type { SimulationContext } from './types'

import {
  DEFAULT_MATURITY_YEARS,
  effectiveFatCapacity,
  levelFromAgeYears,
  maxMassForLevel,
} from '@/ecs/lifecycle'
import { clamp } from '@/utils/math'

const DEFAULT_MASS_BUILD_COST = 35 // intake units per 1.0 mass at 100% efficiency

export function eatingGreed(ctx: SimulationContext, agentId: number): number {
  return clamp(ctx.genomes.get(agentId)?.eatingGreed ?? 0.5, 0, 1)
}

export function levelForAgent(ctx: SimulationContext, agentId: number): number {
  const birthTick = ctx.birthTick.get(agentId) ?? ctx.tick
  const yearTicks = Math.max(1, ctx.yearTicks || 2400)
  const ageYears = Math.max(0, ctx.tick - birthTick) / yearTicks
  return levelFromAgeYears(ageYears)
}

// Applies food intake to an eater:
// - fills energy up to a greed-scaled satiation line
// - allocates some excess into body mass (up to level-based cap)
// - stores remaining excess as fat (up to fat capacity)
export function applyFoodIntake(
  ctx: SimulationContext,
  eaterEntity: number,
  eaterId: number,
  intake: number,
  options?: { maturityYears?: number; satiationMultiplier?: number; massBuildCost?: number },
) {
  if (!Number.isFinite(intake) || intake <= 0) return

  // Track intake for manure production. `intake` here is the actual consumed nutrient/energy payload.
  Digestion.intakeSinceManure[eaterEntity] = (Digestion.intakeSinceManure[eaterEntity] || 0) + intake
  Digestion.recentIntake[eaterEntity] = (Digestion.recentIntake[eaterEntity] || 0) + intake

  const genome = ctx.genomes.get(eaterId)
  const greed = clamp(genome?.eatingGreed ?? 0.5, 0, 1)
  const metabolismNeed = Math.max(Energy.metabolism[eaterEntity], 1)
  const hungerLine = (genome?.hungerThreshold ?? metabolismNeed * 8) + Energy.sleepDebt[eaterEntity]
  const satiationMultiplier = clamp(options?.satiationMultiplier ?? 1, 0.2, 3)
  const satiation = hungerLine * (0.9 + greed * 1.3) * satiationMultiplier // base: 0.9x .. 2.2x hungerLine

  const need = Math.max(0, satiation - Energy.value[eaterEntity])
  const toEnergy = Math.min(intake, need)
  Energy.value[eaterEntity] += toEnergy
  let remaining = intake - toEnergy
  if (remaining <= 0) return

  if (genome) {
    const level = levelForAgent(ctx, eaterId)
    const maturityYears = Math.max(1, Math.floor(options?.maturityYears ?? DEFAULT_MATURITY_YEARS))
    const maxMass = clamp(
      maxMassForLevel(genome.bodyMass, level, { maturityYears }),
      0.2,
      80,
    )
    const currentMass = clamp(Body.mass[eaterEntity] || genome.bodyMass || 1, 0.2, 80)
    if (currentMass < maxMass) {
      // Greedier animals bias surplus toward fat rather than lean mass.
      const efficiency = clamp(0.55 - greed * 0.25, 0.2, 0.55)
      const massBuildCost = Math.max(1, options?.massBuildCost ?? DEFAULT_MASS_BUILD_COST)
      const energyPerMass = massBuildCost / Math.max(efficiency, 0.05)
      const massRoom = maxMass - currentMass
      const gain = Math.min(massRoom, remaining / energyPerMass)
      if (gain > 0) {
        Body.mass[eaterEntity] = currentMass + gain
        remaining -= gain * energyPerMass
      }
    }

    // Refresh fat capacity after any mass gain so storage scales immediately with growth.
    const updatedMass = clamp(Body.mass[eaterEntity] || currentMass, 0.2, 80)
    Energy.fatCapacity[eaterEntity] = effectiveFatCapacity(genome, updatedMass)
    if (Energy.fatStore[eaterEntity] > Energy.fatCapacity[eaterEntity]) {
      Energy.fatStore[eaterEntity] = Energy.fatCapacity[eaterEntity]
    }
  }

  const cap = Math.max(0, Energy.fatCapacity[eaterEntity] || 0)
  const space = Math.max(0, cap - Energy.fatStore[eaterEntity])
  const toFat = Math.min(remaining, space)
  Energy.fatStore[eaterEntity] += toFat
  remaining -= toFat

  // Any remaining intake beyond fat capacity is largely wasted.
  if (remaining > 0) {
    Energy.value[eaterEntity] += remaining * 0.05
  }
}
