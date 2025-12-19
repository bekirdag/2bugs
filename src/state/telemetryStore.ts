import { writable } from 'svelte/store'

export interface TelemetryData {
  timings: Record<string, number>
  geneAverages: Record<string, number>
  eatCounts: {
    hunter: number
    prey: number
    scavenger: number
  }
  fps?: number
}

export const telemetryStore = writable<TelemetryData | null>(null)
