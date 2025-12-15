import type { Vector2, WorldConfig } from '@/types/sim'
import { mulberry32, randRange } from '@/utils/rand'
import { distanceSquared } from '@/utils/math'

export interface RockSpec {
  id: number
  position: Vector2
  radius: number
  // A rough polygon outline in local space around the rock center (used for rendering).
  outline: Vector2[]
}

const ROCK_SEED_SALT = 0x9e3779b9
export const MAX_BOULDER_RADIUS = 1350

export function rockRngSeed(worldSeed: number) {
  // Derive a stable seed that won't perturb the main sim RNG stream.
  return (worldSeed ^ ROCK_SEED_SALT) >>> 0
}

export function generateRocks(config: Pick<WorldConfig, 'bounds' | 'rngSeed'>): RockSpec[] {
  const rng = mulberry32(rockRngSeed(config.rngSeed))
  const bounds = config.bounds
  const area = Math.max(1, bounds.x * bounds.y)
  const maxRadiusFromBounds = Math.max(6, Math.min(bounds.x, bounds.y) / 2 - 32)

  // Mixture of pebbles + rocks + boulders.
  const targetCount = clampInt(Math.round(area / 140_000), 10, 40)
  const rocks: RockSpec[] = []

  for (let id = 1; id <= targetCount; id++) {
    let placed = false
    const radius = Math.min(sampleRockRadius(rng), maxRadiusFromBounds)
    const margin = radius + 24

    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate: Vector2 = {
        x: randRange(rng, margin, Math.max(margin, bounds.x - margin)),
        y: randRange(rng, margin, Math.max(margin, bounds.y - margin)),
      }

      const ok = rocks.every((existing) => {
        const min = existing.radius + radius + 28
        return distanceSquared(existing.position, candidate) >= min * min
      })
      if (!ok) continue

      rocks.push({ id, position: candidate, radius, outline: generateRockOutline(rng, radius) })
      placed = true
      break
    }

    if (!placed) {
      // Fall back to a looser placement if space is tight.
      rocks.push({
        id,
        position: { x: randRange(rng, 0, bounds.x), y: randRange(rng, 0, bounds.y) },
        radius,
        outline: generateRockOutline(rng, radius),
      })
    }
  }

  return rocks
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function sampleRockRadius(rng: () => number) {
  const roll = rng()
  // Bias toward pebbles, with occasional big boulders.
  if (roll < 0.6) {
    return randRange(rng, 8, 18) // pebbles
  }
  if (roll < 0.97) {
    return randRange(rng, 20, 60) // normal rocks
  }
  // Allow very large boulders (up to 10x the prior max), capped by world bounds in `generateRocks`.
  return randRange(rng, 70, MAX_BOULDER_RADIUS)
}

function generateRockOutline(rng: () => number, radius: number): Vector2[] {
  // A low-vertex, blobby polygon looks more rock-like than a circle.
  const vertexCount = clampInt(Math.round(randRange(rng, 6, 11)), 6, 12)
  const points: Vector2[] = []
  const roughness = clamp01(0.12 + rng() * 0.22)
  const squish = clamp01(0.75 + rng() * 0.35)
  const rotation = rng() * Math.PI * 2

  for (let i = 0; i < vertexCount; i++) {
    const t = i / vertexCount
    const angle = rotation + t * Math.PI * 2
    // Radial jitter + a mild second harmonic for lopsided stones.
    const wobble = 1 + Math.sin(t * Math.PI * 4 + rng() * Math.PI * 2) * 0.08
    const jitter = 1 + (rng() - 0.5) * 2 * roughness
    const r = radius * wobble * jitter
    // Elliptical squish for variety
    const x = Math.cos(angle) * r * squish
    const y = Math.sin(angle) * r * (2 - squish)
    points.push({ x, y })
  }

  return points
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}
