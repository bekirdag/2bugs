import { createWorldFromSnapshot } from '../src/ecs/world'
import { DEFAULT_WORLD_CONFIG } from '../src/types/sim'
import { legacyPhpToSnapshot } from '../src/utils/legacyAdapter'
import { serialize } from 'php-serialize'
import { __test__ } from '../src/ecs/systems/perceptionSystem'

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

// Eyes-only animal: no hearing/smell fallback, so direction should fully gate detection.
genome.bodyPlan.senses = [
  {
    sense: 'eye',
    count: 2,
    distribution: 'head',
    acuity: 0.7,
    layout: {
      placements: [
        { x: 0.42, y: -0.12, angle: 0 },
        { x: 0.42, y: 0.12, angle: 0 },
      ],
    },
  },
]

{
  const senses = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 200)
  const chanceBehind = __test__.combinedDetectionChance(senses, -120, 0, 120, 0.5, 0, () => 0.5)
  if (chanceBehind !== 0) {
    throw new Error(`Expected strictly-forward eyes to not see behind, got ${chanceBehind}`)
  }
}

{
  genome.bodyPlan.senses[0]!.layout!.placements = [
    { x: 0.42, y: -0.12, angle: Math.PI },
    { x: 0.42, y: 0.12, angle: Math.PI },
  ]
  const senses = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 200)
  const chanceBehind = __test__.combinedDetectionChance(senses, -120, 0, 120, 0.5, 0, () => 0.5)
  if (!(chanceBehind > 0.05)) {
    throw new Error(`Expected backward-facing eyes to see behind, got ${chanceBehind}`)
  }
}

console.log('directional vision placement test passed')

