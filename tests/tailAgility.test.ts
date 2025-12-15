import { createBaseBodyPlan, deriveLandLocomotion } from '../src/ecs/bodyPlan'

const planWithTail = createBaseBodyPlan('prey', 'land')
const planNoTail = createBaseBodyPlan('prey', 'land')
planNoTail.appendages = planNoTail.appendages.filter((a) => a.kind !== 'tail')

const withTail = deriveLandLocomotion(planWithTail, 'prey', 'land')
const noTail = deriveLandLocomotion(planNoTail, 'prey', 'land')

if (!(withTail.legCount > 0 && noTail.legCount > 0)) {
  throw new Error('Expected both plans to have legs for this test')
}

if (!(withTail.agility > noTail.agility)) {
  throw new Error(`Expected tail to improve agility (with=${withTail.agility} without=${noTail.agility})`)
}

if (!(withTail.agility - noTail.agility >= 0.08)) {
  throw new Error(
    `Expected tail agility bonus to be noticeable, got with=${withTail.agility.toFixed(3)} without=${noTail.agility.toFixed(3)}`,
  )
}

console.log('tail agility test passed')

