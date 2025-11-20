import { AgentMeta, DNA, Heading, Position } from '../components'
import type { SimulationContext } from '../types'

import { lerpAngle } from '@/utils/math'

export function flockingSystem(ctx: SimulationContext, dt: number, strength = 1) {
  ctx.agents.forEach((entity, id) => {
    const cohesion = DNA.socialDrive[entity] ?? 0
    if (cohesion < 0.2) return

    const mePos = { x: Position.x[entity], y: Position.y[entity] }
    const range = (80 + cohesion * 120) * (0.5 + strength)
    const neighbors = ctx.agentIndex.query(mePos, range)
    let sumX = 0
    let sumY = 0
    let count = 0

    neighbors.forEach((bucket) => {
      if (bucket.id === id) return
      const otherEntity = ctx.agents.get(bucket.id)
      if (otherEntity === undefined) return
      if (AgentMeta.archetype[otherEntity] !== AgentMeta.archetype[entity]) return
      sumX += Position.x[otherEntity]
      sumY += Position.y[otherEntity]
      count++
    })

    if (count === 0) return
    const avgX = sumX / count
    const avgY = sumY / count
    const desired = Math.atan2(avgY - mePos.y, avgX - mePos.x)
    const turn = Math.min(1, cohesion * 0.6 * dt * strength)
    Heading.angle[entity] = lerpAngle(Heading.angle[entity], desired, turn)
  })
}
