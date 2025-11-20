import { get, writable } from 'svelte/store'

import type { SavedSnapshot, SimulationSnapshot } from '@/types/sim'
import { SNAPSHOT_VERSION } from '@/types/sim'

const STORAGE_KEY = 'hunt-modern:snapshots'
const MAX_SNAPSHOTS = 10

const initialSnapshots = loadSnapshots()

export const snapshotsStore = writable<SavedSnapshot[]>(initialSnapshots)
export const saveStatusStore = writable<{ state: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({
  state: 'idle',
})

snapshotsStore.subscribe((value) => {
  persistSnapshots(value)
})

export function persistSnapshot(snapshot: SimulationSnapshot, label: string) {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error('Snapshot version mismatch')
  }

  const entry: SavedSnapshot = {
    id: createId(),
    label,
    savedAt: Date.now(),
    snapshot,
  }

  snapshotsStore.update((current) => {
    const filtered = current.filter((item) => item.snapshot.version === SNAPSHOT_VERSION)
    const next = [entry, ...filtered].slice(0, MAX_SNAPSHOTS)
    return next
  })
}

export function deleteSnapshot(id: string) {
  snapshotsStore.update((current) => current.filter((item) => item.id !== id))
}

export function renameSnapshot(id: string, label: string) {
  snapshotsStore.update((current) =>
    current.map((item) => (item.id === id ? { ...item, label: label.trim() || item.label } : item)),
  )
}

export function getSnapshotById(id: string) {
  return get(snapshotsStore).find((item) => item.id === id)
}

function loadSnapshots(): SavedSnapshot[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedSnapshot[]
    return parsed.filter((entry) => entry.snapshot?.version === SNAPSHOT_VERSION)
  } catch (error) {
    console.warn('Failed to read snapshots', error)
    return []
  }
}

function persistSnapshots(entries: SavedSnapshot[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (error) {
    throw new Error('Local storage quota exceeded')
  }
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
