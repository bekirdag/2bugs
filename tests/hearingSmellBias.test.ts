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
  { ...DEFAULT_WORLD_CONFIG, rngSeed: 123 },
)

const world = createWorldFromSnapshot(snapshot)
const id = [...world.genomes.keys()][0]
const genome = world.genomes.get(id)
if (!genome) throw new Error('Missing genome')

// Hearing: single left ear should strongly prefer targets on the left when directional.
genome.bodyPlan.senses = [
  {
    sense: 'ear',
    count: 1,
    distribution: 'head',
    acuity: 0.8,
    layout: { placements: [{ x: 0.18, y: -0.35, angle: -Math.PI / 2 }] },
  },
]
{
  const senses = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const left = __test__.combinedDetectionChance(senses, 0, -60, 60, 0.5, 0, () => 0.5)
  const right = __test__.combinedDetectionChance(senses, 0, 60, 60, 0.5, 0, () => 0.5)
  if (!(left > 0.05)) throw new Error(`Expected left ear to detect left target, got ${left}`)
  if (right !== 0) throw new Error(`Expected left ear to not detect right target, got ${right}`)
}

// Smell: forward nose placement should bias detection for targets in front (when both are within FOV).
genome.bodyPlan.senses = [
  {
    sense: 'nose',
    count: 1,
    distribution: 'head',
    acuity: 0.7,
    // Nose points "up" so both front/back targets remain inside the nose FOV; forward bias comes from placement.x.
    layout: { placements: [{ x: 0.65, y: 0, angle: Math.PI / 2 }] },
  },
]
{
  const senses = __test__.buildSenseProfile(genome, 'prey', 0.5, 0, 0)
  const front = __test__.combinedDetectionChance(senses, 60, 0, 60, 0.5, 0, () => 0.5)
  const back = __test__.combinedDetectionChance(senses, -60, 0, 60, 0.5, 0, () => 0.5)
  if (!(front > back)) throw new Error(`Expected forward-biased nose to prefer front target (front=${front} back=${back})`)
}

console.log('hearing/smell placement bias test passed')

