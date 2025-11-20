import type { SimulationSnapshot } from '@/types/sim'

import { getSnapshotById, persistSnapshot, saveStatusStore } from './persistence'

let worker: Worker | null = null
let pendingLabel: string | null = null

export function attachWorker(instance: Worker) {
  worker = instance
}

export function requestWorldSave(label: string) {
  if (!worker) {
    saveStatusStore.set({ state: 'error', message: 'Worker not ready' })
    return false
  }
  pendingLabel = label
  saveStatusStore.set({ state: 'saving', message: `Saving "${label}"...` })
  worker.postMessage({ type: 'request-save' })
  return true
}

export function handleSnapshotFromWorker(snapshot: SimulationSnapshot) {
  const label = pendingLabel ?? `World ${new Date().toLocaleString()}`
  pendingLabel = null
  try {
    persistSnapshot(snapshot, label)
    saveStatusStore.set({ state: 'success', message: `Saved "${label}"` })
    setTimeout(() => {
      saveStatusStore.set({ state: 'idle' })
    }, 2000)
  } catch (error) {
    console.error(error)
    saveStatusStore.set({
      state: 'error',
      message: error instanceof Error ? error.message : 'Save failed',
    })
  }
}

export function loadSnapshotById(id: string) {
  if (!worker) return false
  const snapshot = getSnapshotById(id)
  if (!snapshot) return false
  return loadSnapshotDirect(snapshot.snapshot)
}

export function loadSnapshotDirect(snapshot: SimulationSnapshot) {
  if (!worker) return false
  worker.postMessage({ type: 'load-snapshot', payload: snapshot })
  return true
}
