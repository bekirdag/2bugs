import type { IWorld } from 'bitecs'

import type { DNA, MovementProfile, WorldConfig } from '@/types/sim'
import type { RNG } from '@/utils/rand'
import type { SpatialHash } from '@/utils/spatialHash'
import type { EntityRegistry } from './registry'

export interface SimulationMetrics {
  births: number
  deaths: number
  mutations: number
}

export interface LootSite {
  x: number
  y: number
  nutrients: number
  decay: number
}

export interface SimulationContext {
  world: IWorld
  registry: EntityRegistry
  config: WorldConfig
  tick: number
  nextRainMs: number
  rng: RNG
  agents: Map<number, number>
  plants: Map<number, number>
  genomes: Map<number, DNA>
  locomotion: Map<number, MovementProfile>
  agentIndex: SpatialHash<number>
  plantIndex: SpatialHash<number>
  pregnancies: Map<number, { dna: DNA; mutationMask: number; parentId?: number }>
  birthTick: Map<number, number>
  parentMap: Map<number, number>
  nextAgentId: number
  nextPlantId: number
  metrics: SimulationMetrics
  lootSites: LootSite[]
}
