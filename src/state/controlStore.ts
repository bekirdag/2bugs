import { writable } from 'svelte/store'

import type { ControlState } from '@/types/sim'
import { DEFAULT_CONTROLS } from '@/types/sim'

export const controlStore = writable<ControlState>(DEFAULT_CONTROLS)

export function updateControls(patch: Partial<ControlState>) {
  controlStore.update((current) => ({ ...current, ...patch }))
}

export function togglePause() {
  controlStore.update((current) => ({ ...current, paused: !current.paused }))
}
