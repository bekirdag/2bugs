import { DNA, Energy, Heading, ModeState, Position } from '../components'
import type { SimulationContext } from '../types'

import { clamp, lerpAngle } from '@/utils/math'

const MODE = {
  Graze: 2,
  Hunt: 3,
}

export function scavengerSystem(ctx: SimulationContext, dt: number) {
  const decayRate = dt * 0.4
  ctx.lootSites = ctx.lootSites
    .map((site) => ({ ...site, decay: site.decay - decayRate }))
    .filter((site) => site.decay > 0 && site.nutrients > 0.1)

  if (ctx.lootSites.length === 0) return

  ctx.agents.forEach((entity) => {
    const affinity = DNA.scavengerAffinity[entity] ?? 0
    if (affinity <= 0) return
    const me = { x: Position.x[entity], y: Position.y[entity] }
    let bestIndex = -1
    let bestDist = Infinity
    ctx.lootSites.forEach((site, index) => {
      const dx = me.x - site.x
      const dy = me.y - site.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    })
    if (bestIndex === -1) return
    const target = ctx.lootSites[bestIndex]
    if (bestDist < 16) {
      const intake = target.nutrients * clamp(affinity, 0.2, 1)
      Energy.value[entity] += intake
      Energy.fatStore[entity] = Math.min(
        Energy.fatCapacity[entity],
        Energy.fatStore[entity] + intake * 0.25,
      )
      ctx.lootSites.splice(bestIndex, 1)
      ModeState.mode[entity] = MODE.Graze
    } else {
      const desired = Math.atan2(target.y - me.y, target.x - me.x)
      const turn = Math.min(1, affinity * 0.6 * dt)
      Heading.angle[entity] = lerpAngle(Heading.angle[entity], desired, turn)
      ModeState.mode[entity] = MODE.Hunt
    }
  })
}
