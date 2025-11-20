import { derived, writable } from 'svelte/store'

import type { SimulationSnapshot } from '@/types/sim'

export const latestSnapshot = writable<SimulationSnapshot | null>(null)

export const simStats = derived(latestSnapshot, ($snapshot) => {
  if (!$snapshot) {
    return {
      tick: 0,
      agents: 0,
      plants: 0,
      births: 0,
      deaths: 0,
      mutations: 0,
      avgEnergy: 0,
    }
  }

  const agents = $snapshot.agents.length
  const totalEnergy = $snapshot.agents.reduce((sum, agent) => sum + agent.energy, 0)

  return {
    tick: $snapshot.tick,
    agents,
    plants: $snapshot.plants.length,
    births: $snapshot.stats.totalBirths,
    deaths: $snapshot.stats.totalDeaths,
    mutations: $snapshot.stats.mutations,
    avgEnergy: agents > 0 ? totalEnergy / agents : 0,
  }
})
