# Body Part → Attribute Pipeline

This document maps the newly proposed DNA structure (see `dna-body-plan.md`) to simulation systems. Each anatomical feature drives both rendering geometry and in-world behaviour such as movement, awareness, and energy spending.

## Overview

For each agent at spawn/mutation time:
1. Decode `bodyPlan` genes into normalized part descriptors.
2. Build derived stats (stride, thrust, lift, sensory radius, upkeep costs).
3. Feed derived stats into:
   - Movement system (acceleration, max speed, turn agility).
   - Sense/Awareness system (vision/hearing/smell/touch/taste radii + precision).
   - Energy/metabolism (idle upkeep + action multipliers).
   - Rendering (construct layered sprites matching part counts/placement).

We’ll implement this pipeline incrementally so existing saves can opt into the new DNA without breaking.

## Derived Stat Formulas

### Movement

| Biome | Components | Derived Values |
| ----- | ---------- | -------------- |
| Land  | Leg count, size, placement, chassis flexibility | `strideLength`, `sprintSpeed`, `pivotAgility`, `jumpImpulse` |
| Water | Fin count, placement, muscle density | `thrustForce`, `turnRate`, `idleDrift`, `burstSpeed` |
| Air   | Wing span/surface/articulation + tail + legs | `liftForce`, `glideEfficiency`, `takeoffCost`, `landingStability` |

Example formula (land stride):
```
strideLength = baseStride * (1 + lengthGene * 0.5) * (legSizeAvg)
sprintSpeed  = strideLength * gaitStyleScale
energyPerStep = (legCount * legSizeAvg) * gaitStyleScale
```

### Senses

For each `SenseGene`:
- `range = baseRange[sense] * (count ^ 0.5) * (0.5 + acuity/2)`
- `precision = basePrecision[sense] * acuity`
- `energyTick = senseCost[sense] * count * (0.5 + acuity)`

Awareness system tracks the highest sense output for detection and fallback to secondary senses when energy is low.

### Energy / Metabolism

Total upkeep per tick:
```
upkeep = chassis.massBias * MASS_COST
       + sum(limb.consumeRate)
       + sum(sense.energyTick)
```

Action costs (moving, gliding, diving) reference the derived stats:
- Run energy cost = strideLength * gaitStyle * mass.
- Flight cost = liftForce * (1 + articulation).
- Swim cost = thrustForce * (1 + muscleDensity).

### Rendering Hooks

Renderer reads:
- `chassis.length/depth/plating` → torso silhouette.
- `limbs` array → create legs/fins/wings/tails with placement anchors.
- `senses` array → draw eye/ear/touch nodes with count + placement.

Each part includes a `seed` id to keep orientation stable between frames.

## Data Flow

1. **DNA Decode (Worker)**: extends existing `deriveStats()` to consume `bodyPlan`.
2. **Simulation Snapshot**: includes `bodyStats` with derived values for renderer + HUD.
3. **Runtime Stores**:
   - `movementStats`: stride, lift, thrust, agility.
   - `senseStats`: per-sense ranges + energy drain.
   - `energyProfile`: idle vs action multipliers.

## Incremental Implementation

1. **Phase A – Senses First**
   - Add `bodyPlan.senses` to DNA.
   - Hook into awareness + energy systems (counts only).
   - Renderer shows simple icons for eyes/ears counts.

2. **Phase B – Limbs for Land Biome**
   - Introduce leg genes and update movement/energy formulas for land creatures.
   - Renderer upgrades land silhouettes (legs + tail placement).

3. **Phase C – Water + Air Modules**
   - Add fins/muscle bands/tails.
   - Add wings + landing legs for air biome.
   - Extend movement system to support swimming/flying locomotion (still respecting existing grounded movement fallback).

4. **Phase D – Attribute Feedback**
   - Use derived stats in HUD (speed, awareness, energy budget).
   - Add mutation effects (randomly adjust limb counts/placements with constraints).

## Backwards Compatibility

Until rollout completes:
- Default DNA will include a `bodyPlanVersion`.
- Missing sections (e.g., old saves) fallback to baseline values (square/circle) with senses derived from legacy stats.
- Migration script populates `bodyPlan` from existing `archetype` + trait biases when loading older saves.
