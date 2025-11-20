# Body Plan Rollout Strategy

The DNA/body-part overhaul touches genetics, rendering, movement, and persistence. To avoid breaking existing worlds we’ll ship the feature in controlled phases. This document outlines the sequence, feature flags, and migration considerations.

## Guiding Principles

1. **Backwards compatibility** – older saves continue to load with legacy square/circle bodies until users opt into the new DNA format.
2. **Feature flags** – each major stage sits behind a runtime flag (`bodyPlanPhaseX`) so we can test in isolation.
3. **Incremental renderer upgrade** – start with sensors and overlays before touching locomotion silhouettes.
4. **Telemetry hooks** – measure energy consumption and movement deltas while both systems coexist.

## Phase Breakdown

### Phase 0 – DNA Envelope

- Introduce `bodyPlanVersion` + empty `bodyPlan` object in DNA, defaulting to `version:0`.
- Add migration code that, when `bodyPlanVersion` < 1, populates baseline values derived from existing traits (e.g., `silhouetteStretch` from bodyMass).
- Renderer + systems ignore `bodyPlan` for now.

**Deliverables**
- TS types update (`BodyPlanGenes` scaffolding).
- Worker migration utilities.
- Save serialization that persists `bodyPlan`.

### Phase 1 – Sensor Integration

- Gate with `featureFlags.sensesFromDna`.
- Populate `bodyPlan.senses` from DNA generator + mutation.
- Awareness/energy systems consume the new sense stats while still supporting legacy fallback.
- Renderer displays sense markers (eye/ear icons) using sense counts.

**Testing**: Compare detection ranges between legacy vs DNA-driven senses to ensure parity.

### Phase 2 – Land Limbs & Movement

- Gate with `featureFlags.landBodyPlan`.
- Extend DNA to include leg/tail genes for land biomes.
- Movement system derives stride/speed from legs; energy costs from gait.
- Renderer draws leg silhouettes (starting with simplified geometry).
- Add telemetry comparing old vs new movement stats to tune constants.

**Migration**: Old land creatures get default two-leg config to avoid zero mobility.

### Phase 3 – Water & Air Modules

- Gate with `featureFlags.aquaticBodyPlan` and `featureFlags.aerialBodyPlan`.
- Add fins/muscle bands and wings/landing legs respectively.
- Movement/energy systems receive swim/flight logic; fallback to ground movement if feature disabled.
- Rendering introduces fins/tails/wings overlays.

**Constraints**: Ensure biome-specific genes only exist for matching archetypes to avoid invalid combos.

### Phase 4 – Attribute Visualization & Mutations

- Expose derived stats (movement speed, awareness, energy budget) in HUD.
- Mutation system mutates body-plan genes (counts, placements) within biome-specific limits.
- Add new telemetry/discovery UI to highlight evolving body parts.

### Phase 5 – Default Enable & Cleanup

- After telemetry confidence, set body-plan flags to `true` by default.
- Remove legacy square/circle rendering fallback.
- Document migration steps for custom saves/mods.

## Versioning & Persistence

- `bodyPlanVersion` increments each phase. Loader applies migrations sequentially.
- Saves store both `bodyPlanVersion` and `featureFlagsApplied` to know which phases ran.
- Provide CLI/tooling to upgrade or downgrade saves (useful for test cases).

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Increased CPU from complex rendering | Bake textures per archetype/biome combination, reuse sprite pooling. |
| Old saves missing data | Migration populates defaults; fallback to version 0 behaviour if `bodyPlan` invalid. |
| Balancing energy/movement | Collect telemetry per phase, keep constants tweakable via config. |
| Feature flag drift | Centralize flags in config store and expose via UI toggle for testers. |

## Next Steps

1. Implement Phase 0 scaffolding (types, serialization, migration).
2. Add feature flag infrastructure if not already present.
3. Prepare unit tests covering DNA migration + derived stat calculations.
4. Schedule renderer updates to align with Phase 2+ timelines.
