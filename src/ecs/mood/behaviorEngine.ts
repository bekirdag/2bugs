import { Intent } from '../components'

import type { BehaviourIntent } from './moodMachine'
import type { AgentMode } from '@/types/sim'

const MODE_CODE: Record<AgentMode, number> = {
  sleep: 1,
  graze: 2,
  hunt: 3,
  flee: 4,
  mate: 5,
  patrol: 6,
  fight: 7,
  idle: 8,
  digest: 9,
  recover: 10,
}

const TARGET_CODE = {
  agent: 1,
  plant: 2,
} as const

export function applyBehaviourIntent(entity: number, intent: BehaviourIntent) {
  Intent.mode[entity] = MODE_CODE[intent.mode] ?? MODE_CODE.patrol
  if (intent.target) {
    Intent.targetType[entity] = TARGET_CODE[intent.target.kind]
    Intent.targetId[entity] = intent.target.id
  } else {
    Intent.targetType[entity] = 0
    Intent.targetId[entity] = 0
  }
}
