import { DNA, Energy, ModeState, Mood } from '../components'
import type { SimulationContext } from '../types'

import { clamp } from '@/utils/math'

const DAY_LENGTH_TICKS = 1800

const MODE = {
  Sleep: 1,
  Patrol: 6,
}

export function circadianSystem(ctx: SimulationContext, dt: number) {
  const phase = ((ctx.tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS) * Math.PI * 2
  const light = 0.5 + 0.5 * Math.sin(phase - Math.PI / 2)

  ctx.agents.forEach((entity) => {
    const bias = DNA.circadianBias[entity] ?? 0
    const preference = bias >= 0 ? light : 1 - light
    const restWindow = preference < 0.35
    const stressDelta = (0.5 - preference) * 0.25 * dt
    Mood.stress[entity] = clamp(Mood.stress[entity] + stressDelta, 0, 1)

    if (restWindow && ModeState.mode[entity] !== MODE.Sleep) {
      ModeState.mode[entity] = MODE.Sleep
    } else if (!restWindow && ModeState.mode[entity] === MODE.Sleep && Energy.sleepDebt[entity] < 0.2) {
      ModeState.mode[entity] = MODE.Patrol
    }
  })
}
