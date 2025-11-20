import { mount } from 'svelte'

import App from '@/App.svelte'
import CreatureDesignPage from '@/pages/CreatureDesignPage.svelte'
import './app.css'
import { pixiStage } from '@/render/pixiStage'
import { controlStore } from '@/state/controlStore'
import { recordSnapshot } from '@/state/historyStore'
import { latestSnapshot } from '@/state/simStore'
import { attachWorker, handleSnapshotFromWorker, rememberWorldConfig } from '@/state/simController'
import type { MainToWorkerMessage, WorkerToMainMessage } from '@/types/messages'
import { DEFAULT_WORLD_CONFIG, type WorldConfig, type SimulationSnapshot } from '@/types/sim'
import { telemetryStore } from '@/state/telemetryStore'
import { recordMutations, resetMutations } from '@/state/mutationStore'

const WORLD_SCALE = 9

import SimulationWorker from './worker?worker'

const root = document.getElementById('app')
const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
const isCreatureDesignRoute = pathname.includes('creature_design')
const AppComponent = isCreatureDesignRoute ? CreatureDesignPage : App
const app = mount(AppComponent, {
  target: root!,
})

if (!isCreatureDesignRoute) {
  initSimulation()
}

export default app

function initSimulation() {
  const worker = new SimulationWorker()
  attachWorker(worker)

  let rendererReady = false
  let pendingSnapshot: SimulationSnapshot | null = null

  void bootstrapRenderer()

  worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data
    if (message.type === 'state') {
      if (typeof window !== 'undefined') {
        // @ts-expect-error debug
        window.__latestSnapshot = message.payload
      }
      latestSnapshot.set(message.payload)
      recordMutations(message.payload)
      if (rendererReady) {
        applySnapshotToStage(message.payload)
      } else {
        pendingSnapshot = message.payload
      }
      recordSnapshot(message.payload)
    } else if (message.type === 'log') {
      console.info(`[sim] ${message.payload}`)
    } else if (message.type === 'snapshot') {
      handleSnapshotFromWorker(message.payload)
    } else if (message.type === 'telemetry') {
      telemetryStore.set(message.payload)
    }
  })

  const unsubscribeControls = controlStore.subscribe((controls) => {
    worker.postMessage({ type: 'update-controls', payload: controls } satisfies MainToWorkerMessage)
  })

  window.addEventListener('beforeunload', () => {
    unsubscribeControls()
    worker.terminate()
  })

  async function bootstrapRenderer() {
    const host = await waitForRendererHost()
    await nextFrame()
    const safeBounds = measureHostBounds(host)
    await pixiStage.init(host, safeBounds)
    pixiStage.fitToScreen()
    rendererReady = true

    const worldConfig: WorldConfig = {
      ...DEFAULT_WORLD_CONFIG,
      bounds: safeBounds,
      rngSeed: Date.now(),
    }
    rememberWorldConfig(worldConfig)
    resetMutations()
    worker.postMessage({ type: 'init', payload: worldConfig } satisfies MainToWorkerMessage)

    if (pendingSnapshot) {
      applySnapshotToStage(pendingSnapshot)
      pendingSnapshot = null
    }
  }

  function measureHostBounds(host: HTMLElement) {
    const measuredWidth = host.clientWidth
    const measuredHeight = host.clientHeight
    const base = Math.max(measuredWidth, measuredHeight)
    const scaled = base > 0 ? Math.max(1, base * WORLD_SCALE) : DEFAULT_WORLD_CONFIG.bounds.x
    return {
      x: scaled,
      y: scaled,
    }
  }

  function applySnapshotToStage(snapshot: SimulationSnapshot) {
    pixiStage.setWorldBounds(snapshot.config.bounds)
    pixiStage.renderSnapshot(snapshot)
  }

  function waitForRendererHost(): Promise<HTMLElement> {
    const existing = document.getElementById('sim-canvas')
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => {
      const attempt = () => {
        const node = document.getElementById('sim-canvas')
        if (node) {
          resolve(node)
        } else {
          requestAnimationFrame(attempt)
        }
      }
      attempt()
    })
  }

  function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}
