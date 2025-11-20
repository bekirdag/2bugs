# Body Part DNA Schema Plan

This document outlines the proposed structure for encoding anatomical features directly inside each agent’s DNA. The goal is to support distinct land, water, and air body plans while letting genes drive rendering, simulation attributes, and future mutations.

## 1. DNA Layout Overview

We extend the `Dna` type with a `bodyPlan` object composed of:

```ts
type CreatureArchetype = 'hunter' | 'prey'
type Biome = 'land' | 'water' | 'air'

type Dna = {
  archetype: CreatureArchetype
  biome: Biome
  bodyPlan: BodyPlanGenes
  // existing metabolic / behaviour genes remain
}

type BodyPlanGenes = {
  chassis: ChassisGene
  senses: SenseGene[]
  limbs: LimbGene[]
  appendages: AppendageGene[]
}
```

The `bodyPlan` object is decomposed into shared sections (chassis + senses) and biome-specific modules (limbs + appendages). Every numerical property is normalized to `0..1` to keep mutations simple.

## 2. Shared Genes

### Chassis
Baseline proportions for the torso.

```ts
type ChassisGene = {
  length: number         // 0..1 maps to silhouette stretch
  depth: number          // 0..1 maps to torso thickness
  massBias: number       // influences base bodyMass / energy cost
  flexibility: number    // used for animation + turn agility
  plating: number        // dorsal armor strokes and defense weight
}
```

### Senses

All animals can unlock eyes, ears, nose (smell), touch receptors, and taste nodes. Each entry defines quantity and placement.

```ts
type SenseGene = {
  sense: 'eye' | 'ear' | 'nose' | 'touch' | 'taste'
  count: number          // integer >= 0
  distribution: 'head' | 'torso' | 'limb' | 'tail'
  acuity: number         // 0..1 each sense accuracy
  energyCost: number     // derived, but stored for fast lookup
}
```

Simulation impact:
- Vision range scales with `eye.count` and `eye.acuity`.
- Hearing + smell affect awareness radius; touch & taste influence close-range behaviours.
- Each sense contributes upkeep energy (`energyCost` gets computed from count, size, and archetype bias).

## 3. Biome Modules

### Land: Legs

```ts
type LimbGene = {
  limb: 'leg'
  count: number               // e.g., 2, 4, 6
  size: number                // relative length/width
  placement: 'front' | 'mid' | 'rear' | 'mixed'
  gaitStyle: number           // 0..1 blending between sprinter vs sturdy
}
```

Attributes driven:
- Acceleration + max speed from `count` × `size`.
- Stability bonus from placement symmetry.
- Energy drain per stride from `gaitStyle` (sprinters burn more).

### Water: Fins & Body Muscles

```ts
type AppendageGene =
  | {
      type: 'fin'
      count: number
      size: number
      placement: 'dorsal' | 'ventral' | 'lateral' | 'tail'
      steeringBias: number    // influences turn speed
    }
  | {
      type: 'muscle-band'
      density: number         // 0..1 affects undulation force
      flexibility: number
    }
  | {
      type: 'tail'            // shared with flying archetype
      size: number
      split: number           // multi-tail probability
    }
```

Water creatures lean on fins for thrust/steering, while muscle bands control body wave strength. Tails provide quick bursts; energy usage ties to muscle density.

### Air: Wings + Legs + Tail

Flying animals reuse leg genes (for landing) and tail genes but add wings:

```ts
type WingGene = {
  span: number             // wingspan ratio
  surface: number          // membrane area
  count: 2 | 4             // default 2 but genes can extend
  articulation: number     // joint flexibility
}
```

Energy cost for flight = base + (span × surface × articulation). Tails stabilize pitch; legs reduce landing damage and may double as graspers.

## 4. Attribute Pipeline Hooks

Once genes are decoded:
1. **Renderer** reads `bodyPlan` to build silhouettes (eyes, limbs, wings, etc.).
2. **Physics/Movement** derives stride length, thrust, lift from limb/wing/fins.
3. **Senses** instantiate awareness ranges with per-sense energy ticking.
4. **Energy Budget** aggregates costs from limbs + senses to adjust metabolism.

Values remain normalized until final systems consume them; this keeps mutation math consistent.

## 5. Next Steps

1. Finalize TypeScript interfaces in `/src/types/sim.ts`.
2. Update DNA generation/mutation code to produce biome-aware body plans.
3. Instrument renderer + systems to consume the new structure incrementally (start with sensors → limbs → energy).
