import type { Vector2 } from '@/types/sim'

export const distanceSquared = (a: Vector2, b: Vector2) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export const distance = (a: Vector2, b: Vector2) => Math.sqrt(distanceSquared(a, b))

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

export const lerpAngle = (a: number, b: number, t: number) => {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + diff * t
}
