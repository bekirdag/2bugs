import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_WORLD_CONFIG } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { __test__ } from '../src/ecs/systems/reproductionSystem'

const snapshot = legacyPhpToSnapshot(
  serialize(
    {
      prey1: {
        type: 'prey',
        x: 500,
        y: 500,
        speed: 60,
        eyesightfactor: 60,
        aggression: 20,
        threshold: 60,
        max_storage: 200,
        store_using_threshold: 70,
      },
    },
    'utf-8',
  ),
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 123 },
)

const world = createWorldFromSnapshot(snapshot)
const id = [...world.genomes.keys()][0]
const genome = world.genomes.get(id)
if (!genome) throw new Error('Missing genome')

genome.biome = 'land'
genome.bodyPlan.senses = [
  {
    sense: 'eye',
    count: 2,
    distribution: 'head',
    acuity: 0.7,
    layout: { placements: [{ x: 0.4, y: -0.1, angle: 0 }, { x: 0.4, y: 0.1, angle: 0 }] },
  },
]

const before = JSON.parse(JSON.stringify(genome.bodyPlan.senses[0]!.layout!.placements)) as {
  x: number
  y: number
  angle: number
}[]

const seq = [0.5, 0.01, 0.9, 0.1, 0.8, 0.2, 0.7]
let idx = 0
const rng = () => {
  const v = seq[Math.min(idx, seq.length - 1)]!
  idx++
  return v
}

__test__.mutateBodyPlanGenes(genome as any, { rng } as any)

const after = genome.bodyPlan.senses[0]!.layout!.placements

const changed = after.some((p, i) => {
  const b = before[i]!
  return p.x !== b.x || p.y !== b.y || p.angle !== b.angle
})
if (!changed) {
  throw new Error('Expected sense placement mutation to change an eye placement')
}

console.log('body plan placement mutation test passed')

