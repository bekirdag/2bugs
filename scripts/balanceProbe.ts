import { initWorld, snapshotWorld, stepWorld } from '../src/ecs/world'
import { DEFAULT_CONTROLS, DEFAULT_WORLD_CONFIG, type ControlState } from '../src/types/sim'

type ProbeResult = {
  label: string
  tick: number
  agents: number
  plants: number
  avgEnergy: number
  births: number
  deaths: number
}

function runProbe(label: string, patch: Partial<ControlState>, steps = 24_000): ProbeResult {
  const ctx = initWorld({ ...DEFAULT_WORLD_CONFIG, rngSeed: 1337 })
  const controls: ControlState = { ...DEFAULT_CONTROLS, ...patch, paused: false, speed: 1 }

  for (let i = 0; i < steps; i++) {
    stepWorld(ctx, DEFAULT_WORLD_CONFIG.timeStepMs, controls)
    if ((i + 1) % 3000 === 0) {
      const snap = snapshotWorld(ctx)
      const avgEnergy =
        snap.agents.reduce((sum, agent) => sum + agent.energy, 0) / Math.max(1, snap.agents.length)
      console.log(
        `[${label}] tick=${snap.tick} agents=${snap.agents.length} plants=${snap.plants.length} avgEnergy=${avgEnergy.toFixed(1)} births=${snap.stats.totalBirths} deaths=${snap.stats.totalDeaths}`,
      )
    }
  }

  const snap = snapshotWorld(ctx)
  const avgEnergy =
    snap.agents.reduce((sum, agent) => sum + agent.energy, 0) / Math.max(1, snap.agents.length)
  return {
    label,
    tick: snap.tick,
    agents: snap.agents.length,
    plants: snap.plants.length,
    avgEnergy,
    births: snap.stats.totalBirths,
    deaths: snap.stats.totalDeaths,
  }
}

const results: ProbeResult[] = [
  runProbe('baseline', {}, 24_000),
  runProbe(
    'candidate-locomotion',
    {
      gaitCadenceScale: 0.95,
      stanceThreshold: 0.54,
      thrustPower: 1.2,
      slipScale: 0.8,
    },
    24_000,
  ),
]

for (const r of results) {
  console.log(
    [
      r.label.padEnd(12),
      `tick=${r.tick}`,
      `agents=${r.agents}`,
      `plants=${r.plants}`,
      `avgEnergy=${r.avgEnergy.toFixed(1)}`,
      `births=${r.births}`,
      `deaths=${r.deaths}`,
    ].join(' '),
  )
}
