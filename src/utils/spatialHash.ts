import type { Vector2 } from '@/types/sim'

export interface SpatialBucket<T> {
  id: number
  data: T
}

export class SpatialHash<T = number> {
  #cellSize: number
  #cells = new Map<string, SpatialBucket<T>[]>()
  #index = new Map<number, string>()

  constructor(cellSize: number) {
    this.#cellSize = cellSize
  }

  private key(x: number, y: number) {
    const cx = Math.floor(x / this.#cellSize)
    const cy = Math.floor(y / this.#cellSize)
    return `${cx}:${cy}`
  }

  set(position: Vector2, bucket: SpatialBucket<T>) {
    const key = this.key(position.x, position.y)
    const previousKey = this.#index.get(bucket.id)
    if (previousKey && previousKey !== key) {
      const previousCell = this.#cells.get(previousKey)
      if (previousCell) {
        const idx = previousCell.findIndex((entry) => entry.id === bucket.id)
        if (idx >= 0) {
          previousCell.splice(idx, 1)
        }
        if (previousCell.length === 0) {
          this.#cells.delete(previousKey)
        }
      }
    }

    const cell = this.#cells.get(key)
    if (cell) {
      const index = cell.findIndex((entry) => entry.id === bucket.id)
      if (index >= 0) {
        cell[index] = bucket
      } else {
        cell.push(bucket)
      }
    } else {
      this.#cells.set(key, [bucket])
    }
    this.#index.set(bucket.id, key)
  }

  delete(id: number) {
    const key = this.#index.get(id)
    if (!key) return
    const cell = this.#cells.get(key)
    if (cell) {
      const index = cell.findIndex((entry) => entry.id === id)
      if (index >= 0) {
        cell.splice(index, 1)
      }
      if (cell.length === 0) {
        this.#cells.delete(key)
      }
    }
    this.#index.delete(id)
  }

  query(position: Vector2, radius: number) {
    const results: SpatialBucket<T>[] = []
    const minX = Math.floor((position.x - radius) / this.#cellSize)
    const maxX = Math.floor((position.x + radius) / this.#cellSize)
    const minY = Math.floor((position.y - radius) / this.#cellSize)
    const maxY = Math.floor((position.y + radius) / this.#cellSize)

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = `${cx}:${cy}`
        const cell = this.#cells.get(key)
        if (!cell) continue
        results.push(...cell)
      }
    }

    return results
  }

  clear() {
    this.#cells.clear()
    this.#index.clear()
  }
}
