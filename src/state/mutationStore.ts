import { derived, writable } from 'svelte/store'

import type { SimulationSnapshot } from '@/types/sim'
import { genesFromMask, type GeneKey } from '@/ecs/genetics'

export interface MutationEvent {
  id: number
  archetype: string
  biome: string
  tick: number
  familyColor: string
  genes: GeneKey[]
  bodyPlanChanged: boolean
}

const MAX_EVENTS = 10
const seen = new Set<number>()

export const mutationEvents = writable<MutationEvent[]>([])

export const biomeMutationTally = derived(mutationEvents, ($events) => {
  return $events.reduce<Record<string, number>>((acc, event) => {
    acc[event.biome] = (acc[event.biome] ?? 0) + 1
    return acc
  }, {})
})

export function recordMutations(snapshot: SimulationSnapshot) {
  if (snapshot.tick === 0) {
    resetMutations()
  }

  const fresh = snapshot.agents
    .filter((agent) => agent.mutationMask && !seen.has(agent.id))
    .map((agent) => {
      const genes = genesFromMask(agent.mutationMask!)
      const bodyPlanChanged = (agent.mutationMask! & 0x80000000) !== 0
      seen.add(agent.id)
      return {
        id: agent.id,
        archetype: agent.dna.archetype,
        biome: agent.dna.biome,
        tick: snapshot.tick,
        familyColor: agent.dna.familyColor,
        genes,
        bodyPlanChanged,
      } satisfies MutationEvent
    })

  if (!fresh.length) return

  mutationEvents.update((events) => {
    const next = [...fresh, ...events]
    return next.slice(0, MAX_EVENTS)
  })
}

export function resetMutations() {
  seen.clear()
  mutationEvents.set([])
}
