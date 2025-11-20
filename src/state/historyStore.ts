import { writable } from 'svelte/store'

import type { SimulationSnapshot } from '@/types/sim'

export interface TraitSample {
  tick: number
  avgSpeed: number
  avgVision: number
  avgAggression: number
  avgMetabolism: number
  avgBodyMass: number
  avgAwareness: number
}

const MAX_POINTS = 400

export const traitHistory = writable<TraitSample[]>([])
export interface NotableAgent {
  id: number
  label: string
  description: string
}
export const notableAgentsStore = writable<NotableAgent[]>([])
export function historyToCSV(samples: TraitSample[]): string {
  const header = [
    'tick',
    'avgSpeed',
    'avgVision',
    'avgAggression',
    'avgMetabolism',
    'avgBodyMass',
    'avgAwareness',
  ].join(',')
  const rows = samples.map((sample) =>
    [
      sample.tick,
      sample.avgSpeed.toFixed(2),
      sample.avgVision.toFixed(2),
      sample.avgAggression.toFixed(2),
      sample.avgMetabolism.toFixed(2),
      sample.avgBodyMass.toFixed(2),
      sample.avgAwareness.toFixed(2),
    ].join(','),
  )
  return [header, ...rows].join('\n')
}

export function recordSnapshot(sample: SimulationSnapshot) {
  if (sample.agents.length === 0) return

  const totals = sample.agents.reduce(
    (acc, agent) => {
      acc.speed += agent.dna.baseSpeed
      acc.vision += agent.dna.visionRange
      acc.aggression += agent.dna.aggression
      acc.metabolism += agent.dna.metabolism
      acc.bodyMass += agent.dna.bodyMass
      acc.awareness += agent.dna.awareness
      return acc
    },
    { speed: 0, vision: 0, aggression: 0, metabolism: 0, bodyMass: 0, awareness: 0 },
  )
  const count = sample.agents.length
  const next: TraitSample = {
    tick: sample.tick,
    avgSpeed: totals.speed / count,
    avgVision: totals.vision / count,
    avgAggression: totals.aggression / count,
    avgMetabolism: totals.metabolism / count,
    avgBodyMass: totals.bodyMass / count,
    avgAwareness: totals.awareness / count,
  }

  traitHistory.update((history) => {
    const updated = [...history, next]
    if (updated.length > MAX_POINTS) {
      updated.shift()
    }
    return updated
  })

  notableAgentsStore.set(pickNotableAgents(sample))
}

function pickNotableAgents(sample: SimulationSnapshot): NotableAgent[] {
  if (sample.agents.length === 0) return []
  const oldest = [...sample.agents].sort((a, b) => b.age - a.age)[0]
  const fattest = [...sample.agents].sort((a, b) => b.fatStore - a.fatStore)[0]
  const mostAggressive = [...sample.agents].sort((a, b) => b.dna.aggression - a.dna.aggression)[0]
  return [
    {
      id: oldest.id,
      label: `Oldest #${oldest.id}`,
      description: `${oldest.dna.archetype} • Age ${Math.round(oldest.age)}`,
    },
    {
      id: fattest.id,
      label: `Fattest #${fattest.id}`,
      description: `${fattest.dna.archetype} • Store ${Math.round(fattest.fatStore)}`,
    },
    {
      id: mostAggressive.id,
      label: `Fiercest #${mostAggressive.id}`,
      description: `${mostAggressive.dna.archetype} • Agg ${mostAggressive.dna.aggression.toFixed(2)}`,
    },
  ]
}
