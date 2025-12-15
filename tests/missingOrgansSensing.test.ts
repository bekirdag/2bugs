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
      },
    },
    'utf-8',
  ),
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 321 },
)

const world = createWorldFromSnapshot(snapshot)
const id = [...world.genomes.keys()][0]
const genome = world.genomes.get(id)
if (!genome) throw new Error('Missing genome')

// Without ears, hearing should contribute nothing.
{
  genome.bodyPlan.senses = [
    {
      sense: 'ear',
      count: 1,
      distribution: 'head',
      acuity: 0.8,
      layout: { placements: [{ x: 0.18, y: -0.35, angle: -Math.PI / 2 }] },
    },
  ]
  const withEar = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const chanceWithEar = __test__.combinedDetectionChance(withEar, 0, -80, 80, 0.5, 0, () => 0.5)
  if (!(chanceWithEar > 0.05)) throw new Error(`Expected hearing to work with an ear, got ${chanceWithEar}`)

  genome.bodyPlan.senses = []
  const noEar = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const chanceNoEar = __test__.combinedDetectionChance(noEar, 0, -80, 80, 0.5, 0, () => 0.5)
  if (chanceNoEar !== 0) throw new Error(`Expected no ears => no hearing detection, got ${chanceNoEar}`)
}

console.log('missing ears sensing test passed')

// Without a nose, smell should contribute nothing.
{
  genome.bodyPlan.senses = [
    {
      sense: 'nose',
      count: 1,
      distribution: 'head',
      acuity: 0.7,
      layout: { placements: [{ x: 0.65, y: 0, angle: 0 }] },
    },
  ]
  const withNose = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const chanceWithNose = __test__.combinedDetectionChance(withNose, 90, 0, 90, 0.5, 0, () => 0.5)
  if (!(chanceWithNose > 0.02)) throw new Error(`Expected smell to work with a nose, got ${chanceWithNose}`)

  genome.bodyPlan.senses = []
  const noNose = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const chanceNoNose = __test__.combinedDetectionChance(noNose, 90, 0, 90, 0.5, 0, () => 0.5)
  if (chanceNoNose !== 0) throw new Error(`Expected no nose => no smell detection, got ${chanceNoNose}`)
}

console.log('missing nose sensing test passed')
