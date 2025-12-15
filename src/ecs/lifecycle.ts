import type { DNA } from '@/types/sim'
import { clamp } from '@/utils/math'

// One "simulation year" is an abstract duration used for lifetime leveling.
// We define it in ticks so it stays deterministic with the existing tick-based systems.
export const SIM_YEAR_TICKS = 2400

// How many years it takes to reach the genetic adult mass cap.
export const DEFAULT_MATURITY_YEARS = 6

// Minimum mass cap at level 0 as a fraction of adult mass.
export const MIN_LEVEL0_MASS_RATIO = 0.25

// Energy-units conversion used throughout the sim:
// `fatCapacity` historically lived in the same rough scale as `mass * 120`.
export const FAT_CAPACITY_PER_MASS = 120

export const MIN_FAT_CAPACITY = 10

export function levelFromAgeYears(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears <= 0) return 0
  return Math.floor(ageYears)
}

export function ageYearsFromTicks(ageTicks: number): number {
  if (!Number.isFinite(ageTicks) || ageTicks <= 0) return 0
  return ageTicks / SIM_YEAR_TICKS
}

export function ageYearsFromTicksWithYearTicks(ageTicks: number, yearTicks: number): number {
  const denom = Math.max(1, Number.isFinite(yearTicks) ? yearTicks : SIM_YEAR_TICKS)
  if (!Number.isFinite(ageTicks) || ageTicks <= 0) return 0
  return ageTicks / denom
}

export function ageTicksFromYears(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears <= 0) return 0
  return ageYears * SIM_YEAR_TICKS
}

export function ageTicksFromYearsWithYearTicks(ageYears: number, yearTicks: number): number {
  const mult = Math.max(1, Number.isFinite(yearTicks) ? yearTicks : SIM_YEAR_TICKS)
  if (!Number.isFinite(ageYears) || ageYears <= 0) return 0
  return ageYears * mult
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

// Maximum body mass allowed at a given (integer) level.
// Later steps will enforce this cap during growth.
export function maxMassForLevel(
  adultMass: number,
  level: number,
  options?: { maturityYears?: number; minLevel0Ratio?: number },
): number {
  const base = Math.max(0.2, Number.isFinite(adultMass) ? adultMass : 1)
  const maturityYears = Math.max(1, Math.floor(options?.maturityYears ?? DEFAULT_MATURITY_YEARS))
  const minRatio = clamp(options?.minLevel0Ratio ?? MIN_LEVEL0_MASS_RATIO, 0.05, 0.95)
  const t = clamp(level / maturityYears, 0, 1)
  const ratio = minRatio + (1 - minRatio) * smoothstep(t)
  return base * ratio
}

// Derived runtime capacity for fat storage as mass changes over the lifetime.
// `dna.fatCapacity` is treated as the adult fat cap at `dna.bodyMass`; we scale linearly with current mass.
export function effectiveFatCapacity(dna: DNA, currentMass: number): number {
  const adultMass = Math.max(0.2, Number.isFinite(dna.bodyMass) ? dna.bodyMass : 1)
  const adultFatCapacity = Math.max(MIN_FAT_CAPACITY, Number.isFinite(dna.fatCapacity) ? dna.fatCapacity : MIN_FAT_CAPACITY)
  const mass = Math.max(0.2, Number.isFinite(currentMass) ? currentMass : adultMass)
  const scaled = adultFatCapacity * (mass / adultMass)
  return Math.max(MIN_FAT_CAPACITY, scaled)
}

export function effectiveFatBurnThreshold(dna: DNA, currentMass: number, fatCapacity: number): number {
  const adultMass = Math.max(0.2, Number.isFinite(dna.bodyMass) ? dna.bodyMass : 1)
  const adultThreshold = Number.isFinite(dna.fatBurnThreshold) ? dna.fatBurnThreshold : (dna.fatCapacity ?? MIN_FAT_CAPACITY) * 0.5
  const mass = Math.max(0.2, Number.isFinite(currentMass) ? currentMass : adultMass)
  const scaled = adultThreshold * (mass / adultMass)
  return clamp(scaled, 0, Math.max(MIN_FAT_CAPACITY, fatCapacity))
}
