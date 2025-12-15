/// <reference lib="webworker" />

import { createWorldFromSnapshot, initWorld, snapshotWorld, stepWorld } from '@/ecs/world'
import type { MainToWorkerMessage, WorkerToMainMessage } from '@/types/messages'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG } from '@/types/sim'
import type { SimulationSnapshot } from '@/types/sim'
import { effectiveFatCapacity } from '@/ecs/lifecycle'
import { Body, Energy } from '@/ecs/components'
import { SIM_YEAR_TICKS, levelFromAgeYears } from '@/ecs/lifecycle'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let world = initWorld(DEFAULT_WORLD_CONFIG)
let controls = DEFAULT_CONTROLS
let loopHandle: number | null = null
let loopActive = false
let accumulator = 0
let lastTime = performance.now()
let lastSizeLog = performance.now()
let fpsWindow = 0
let fpsFrames = 0
let lastFps = 0
let lastTickTime = performance.now()
let frameCounter = 0
let lastTimings: Record<string, number> = {}
let telemetryHandle: number | null = null

const BASE_DT = DEFAULT_WORLD_CONFIG.timeStepMs
const TELEMETRY_INTERVAL_MS = 1000

ctx.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data
  switch (message.type) {
    case 'init':
      world = initWorld(message.payload)
      pushSnapshot()
      restartLoop()
      restartTelemetry()
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
      restartTelemetry()
      break
  }
})

function runLoop() {
  const now = performance.now()
  const delta = now - lastTime
  accumulator += delta
  lastTime = now

  const fpsDelta = now - lastTickTime
  fpsWindow += fpsDelta
  fpsFrames++
  if (fpsWindow >= 1000) {
    lastFps = Math.round((fpsFrames * 1000) / fpsWindow)
    fpsWindow = 0
    fpsFrames = 0
  }
  lastTickTime = now

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
    frameCounter++
    const snapshot = pushSnapshot()
    const now = performance.now()
    if (now - lastSizeLog >= 10_000) {
      lastSizeLog = now
      // logAgentSizes(snapshot)
    }
    lastTimings = combinedTimings
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

function restartTelemetry() {
  if (telemetryHandle !== null) {
    ctx.clearInterval(telemetryHandle)
    telemetryHandle = null
  }
  telemetryHandle = ctx.setInterval(() => {
    ctx.postMessage(
      {
        type: 'telemetry',
        payload: {
          timings: lastTimings,
          geneAverages: summarizeGenesFromContext(world),
          fps: lastFps,
        },
      } satisfies WorkerToMainMessage,
    )
  }, TELEMETRY_INTERVAL_MS)
}

ctx.postMessage({ type: 'log', payload: 'Simulation worker ready' } satisfies WorkerToMainMessage)

function summarizeGenesFromContext(ctxWorld: typeof world): Record<string, number> {
  const totals: Record<string, number> = {
    speed: 0,
    vision: 0,
    aggression: 0,
    stamina: 0,
    scavenger: 0,
    metabolism: 0,
    awareness: 0,
    greed: 0,
    maturityAge: 0,
    ageYears: 0,
    level: 0,
    mass: 0,
    fatRatio: 0,
    stride: 0,
    fins: 0,
    wings: 0,
  }
  const count = ctxWorld.agents.size
  if (!count) return {}
  ctxWorld.agents.forEach((entity, id) => {
    const dna = ctxWorld.genomes.get(id)
    if (!dna) return
    totals.speed += dna.baseSpeed
    totals.vision += dna.visionRange
    totals.aggression += dna.aggression
    totals.stamina += dna.stamina ?? 1
    totals.scavenger += dna.scavengerAffinity ?? 0
    totals.metabolism += dna.metabolism ?? 0
    totals.awareness += dna.awareness ?? 0
    totals.greed += dna.eatingGreed ?? 0.5
    totals.maturityAge += dna.maturityAgeYears ?? 1

    const birthTick = ctxWorld.birthTick.get(id) ?? ctxWorld.tick
    const yearTicks = Math.max(1, ctxWorld.yearTicks ?? SIM_YEAR_TICKS)
    const ageYears = Math.max(0, ctxWorld.tick - birthTick) / yearTicks
    totals.ageYears += ageYears
    totals.level += levelFromAgeYears(ageYears)

    const mass = Body.mass[entity] || dna.bodyMass || 1
    totals.mass += mass
    const fatCap = Math.max(Energy.fatCapacity[entity] || 0, 1)
    const fatRatio = (Energy.fatStore[entity] || 0) / fatCap
    totals.fatRatio += Math.max(0, Math.min(1, fatRatio))

    if (dna.biome === 'land') {
      const legs = dna.bodyPlan?.limbs.filter((limb) => limb.kind === 'leg').reduce((sum, leg) => sum + leg.count, 0) ?? 0
      totals.stride += legs
    } else if (dna.biome === 'water') {
      const fins = dna.bodyPlan?.appendages
        .filter((appendage) => appendage.kind === 'fin')
        .reduce((sum, fin) => sum + fin.size, 0) ?? 0
      totals.fins += fins
    } else if (dna.biome === 'air') {
      const wing = dna.bodyPlan?.limbs.find((limb) => limb.kind === 'wing')
      totals.wings += wing ? wing.span + wing.surface : 0
    }
  })
  Object.keys(totals).forEach((key) => {
    totals[key] = totals[key] / count
  })
  return totals
}

function logAgentSizes(snapshot: SimulationSnapshot) {
  if (!snapshot.agents.length) return
  const sizes = snapshot.agents.map((agent) => {
    const mass = agent.mass ?? agent.dna.bodyMass
    const fatCapacity = effectiveFatCapacity(agent.dna, mass)
    const weightScale = 1 + (agent.fatStore / Math.max(fatCapacity, 1)) * 0.7
    const size = (6 + mass * 3) * weightScale * 2
    return size
  })
  const minSize = Math.min(...sizes)
  const maxSize = Math.max(...sizes)
  ctx.postMessage({
    type: 'log',
    payload: `Agent size range: min=${minSize.toFixed(2)} max=${maxSize.toFixed(2)} (pixels)`,
  } satisfies WorkerToMainMessage)
}
