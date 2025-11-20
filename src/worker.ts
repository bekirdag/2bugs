/// <reference lib="webworker" />

import { createWorldFromSnapshot, initWorld, snapshotWorld, stepWorld } from '@/ecs/world'
import type { MainToWorkerMessage, WorkerToMainMessage } from '@/types/messages'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG } from '@/types/sim'
import type { SimulationSnapshot } from '@/types/sim'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let world = initWorld(DEFAULT_WORLD_CONFIG)
let controls = DEFAULT_CONTROLS
let loopHandle: number | null = null
let loopActive = false
let accumulator = 0
let lastTime = performance.now()
let lastSizeLog = performance.now()

const BASE_DT = DEFAULT_WORLD_CONFIG.timeStepMs

ctx.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data
  switch (message.type) {
    case 'init':
      world = initWorld(message.payload)
      pushSnapshot()
      restartLoop()
      break
    case 'update-controls':
      controls = message.payload
      if (controls.paused) {
        stopLoop()
      } else {
        startLoop()
      }
      break
    case 'set-paused':
      controls = { ...controls, paused: message.payload }
      if (controls.paused) {
        stopLoop()
      } else {
        startLoop()
      }
      break
    case 'request-save':
      emitSnapshot()
      break
    case 'load-snapshot':
      world = createWorldFromSnapshot(message.payload)
      pushSnapshot()
      restartLoop()
      break
  }
})

function runLoop() {
  const now = performance.now()
  accumulator += now - lastTime
  lastTime = now

  const step = BASE_DT * Math.max(0.1, controls.speed)
  const combinedTimings: Record<string, number> = {}
  let stepsExecuted = false
  while (accumulator >= step) {
    if (!controls.paused) {
      stepsExecuted = true
      const timings = stepWorld(world, step, controls)
      Object.entries(timings).forEach(([label, value]) => {
        combinedTimings[label] = (combinedTimings[label] ?? 0) + value
      })
    }
    accumulator -= step
  }

  if (!controls.paused && stepsExecuted) {
    const snapshot = pushSnapshot()
    const now = performance.now()
    if (now - lastSizeLog >= 10_000) {
      lastSizeLog = now
      // logAgentSizes(snapshot)
    }
    ctx.postMessage(
      {
        type: 'telemetry',
        payload: {
          timings: combinedTimings,
          geneAverages: summarizeGenes(snapshot),
        },
      } satisfies WorkerToMainMessage,
    )
  }
}

function pushSnapshot() {
  const snapshot = snapshotWorld(world)
  ctx.postMessage({ type: 'state', payload: snapshot } satisfies WorkerToMainMessage)
  return snapshot
}

function emitSnapshot() {
  const snapshot = snapshotWorld(world)
  ctx.postMessage({ type: 'snapshot', payload: snapshot } satisfies WorkerToMainMessage)
}

function scheduleLoop() {
  if (!loopActive) return
  const delay = Math.max(0, BASE_DT / 2)
  loopHandle = ctx.setTimeout(() => {
    loopHandle = null
    runLoop()
    scheduleLoop()
  }, delay)
}

function startLoop() {
  if (loopActive) return
  loopActive = true
  lastTime = performance.now()
  scheduleLoop()
}

function stopLoop() {
  loopActive = false
  if (loopHandle !== null) {
    ctx.clearTimeout(loopHandle)
    loopHandle = null
  }
}

function restartLoop() {
  stopLoop()
  if (!controls.paused) {
    startLoop()
  }
}

ctx.postMessage({ type: 'log', payload: 'Simulation worker ready' } satisfies WorkerToMainMessage)

function summarizeGenes(snapshot: SimulationSnapshot): Record<string, number> {
  if (!snapshot.agents.length) return {}
  const totals: Record<string, number> = {
    speed: 0,
    vision: 0,
    aggression: 0,
    stamina: 0,
    scavenger: 0,
    metabolism: 0,
  }
  snapshot.agents.forEach((agent) => {
    totals.speed += agent.dna.baseSpeed
    totals.vision += agent.dna.visionRange
    totals.aggression += agent.dna.aggression
    totals.stamina += agent.dna.stamina ?? 1
    totals.scavenger += agent.dna.scavengerAffinity ?? 0
    totals.metabolism += agent.dna.metabolism ?? 0
  })
  const count = snapshot.agents.length
  Object.keys(totals).forEach((key) => {
    totals[key] = totals[key] / count
  })
  return totals
}

function logAgentSizes(snapshot: SimulationSnapshot) {
  if (!snapshot.agents.length) return
  const sizes = snapshot.agents.map((agent) => {
    const weightScale = 1 + (agent.fatStore / Math.max(agent.dna.fatCapacity, 1)) * 0.7
    const size = (6 + agent.dna.bodyMass * 3) * weightScale * 2
    return size
  })
  const minSize = Math.min(...sizes)
  const maxSize = Math.max(...sizes)
  ctx.postMessage({
    type: 'log',
    payload: `Agent size range: min=${minSize.toFixed(2)} max=${maxSize.toFixed(2)} (pixels)`,
  } satisfies WorkerToMainMessage)
}
