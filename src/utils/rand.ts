export type RNG = () => number

export function mulberry32(seed: number): RNG {
  return function rng() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randRange = (rng: RNG, min: number, max: number) => rng() * (max - min) + min

export const jitter = (rng: RNG, point: { x: number; y: number }, radius: number) => {
  const angle = randRange(rng, 0, Math.PI * 2)
  const dist = randRange(rng, 0, radius)
  return {
    x: point.x + Math.cos(angle) * dist,
    y: point.y + Math.sin(angle) * dist,
  }
}

export const randItem = <T>(rng: RNG, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)]
