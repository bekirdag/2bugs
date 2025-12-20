import { AgentMeta, DNA, Energy, Mood } from '../components'
import type { SimulationContext } from '../types'

import { clamp } from '@/utils/math'
import { clampGeneValue } from '@/ecs/genetics'

const DAY_LENGTH_TICKS = 1800

export function circadianSystem(ctx: SimulationContext, dt: number) {
  const phase = ((ctx.tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS) * Math.PI * 2
  const light = 0.5 + 0.5 * Math.sin(phase - Math.PI / 2)

  ctx.agents.forEach((entity) => {
    const bias = DNA.circadianBias[entity] ?? 0
    const preference = bias >= 0 ? light : 1 - light
    const genome = ctx.genomes.get(AgentMeta.id[entity])
    const sleepCircadianRestThreshold = clampGeneValue(
      'sleepCircadianRestThreshold',
      genome?.sleepCircadianRestThreshold ?? 0,
    )
    const sleepCircadianStressScale = clampGeneValue(
      'sleepCircadianStressScale',
      genome?.sleepCircadianStressScale ?? 0,
    )
    const sleepCircadianPushScale = clampGeneValue(
      'sleepCircadianPushScale',
      genome?.sleepCircadianPushScale ?? 0,
    )
    const sleepCircadianPreferenceMidpoint = clampGeneValue(
      'sleepCircadianPreferenceMidpoint',
      genome?.sleepCircadianPreferenceMidpoint ?? 0,
    )
    const sleepDebtMax = Math.max(clampGeneValue('sleepDebtMax', genome?.sleepDebtMax ?? 0), 0.1)
    const restWindow = preference < sleepCircadianRestThreshold
    const stressDelta = (sleepCircadianPreferenceMidpoint - preference) * sleepCircadianStressScale * dt
    Mood.stress[entity] = clamp(Mood.stress[entity] + stressDelta, 0, 1)

    // Circadian rhythm should bias sleep pressure, not hard-overwrite the agent's chosen mode.
    // Push sleep debt up during the rest window so the mood machine is more likely to choose sleep.
    if (restWindow) {
      const push = clamp(
        sleepCircadianRestThreshold > 0
          ? (sleepCircadianRestThreshold - preference) / sleepCircadianRestThreshold
          : 0,
        0,
        1,
      )
      Energy.sleepDebt[entity] = Math.min(
        sleepDebtMax,
        Energy.sleepDebt[entity] + push * dt * sleepCircadianPushScale,
      )
    }
  })
}
