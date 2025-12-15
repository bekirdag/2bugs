# Hunt Modern (modern-app)

A modern TypeScript/Svelte + PixiJS rebuild of the legacy predator/prey “hunt” simulation.

- **Simulation**: deterministic ECS (bitECS) running in a **Web Worker**
- **Rendering**: **PixiJS** stage drawing agents/plants + optional debug overlays
- **UI**: **Svelte** HUD for controls, telemetry, history charts, and persistence

This folder (`modern-app/`) is the runnable web app (Vite dev server + production build).

## Quick start

```bash
cd modern-app
npm install
npm run dev
```

Open `http://localhost:5173`.

## What the product is about

Hunt Modern is a sandbox for observing emergent behavior in a simple ecology. Creatures move, perceive, eat, rest, reproduce, and mutate over time; plants grow and regrow; the UI exposes controls so you can tune parameters and immediately see the impact on population dynamics and trait distributions.

The app is designed to be:

- **Fast**: heavy simulation work stays off the main thread
- **Observable**: telemetry and debug overlays make system behavior inspectable
- **Tweakable**: controls allow rapid behavior/world iteration
- **Stable**: deterministic smoke tests reduce accidental behavior regressions

## Animals, biomes, and attributes

The simulation has **animals** (agents) and **plants**:

- **Hunters** (`dna.archetype: "hunter"`) are carnivores that hunt other agents.
- **Prey** (`dna.archetype: "prey"`) are herbivores that graze plants and tend to flock.
- **Plants** are passive resource entities (separate `PlantDNA`), consumed by prey.

Each animal also has a **biome** (`dna.biome: "land" | "water" | "air"`) which influences its default anatomy (legs vs fins vs wings) and, when enabled, its locomotion bonuses.

For testing, the current default world spawns only **land** hunters + **land** prey (plus plants).

### DNA-driven traits (high level)

Every animal has a `dna` object (see `modern-app/src/types/sim.ts`) that drives behavior, physiology, reproduction, and (optionally) anatomy-derived stats.

At runtime the worker keeps a stable genome per agent in `ctx.genomes` and snapshots include `agent.dna`, so traits persist across save/load.

### Trait reference (all DNA fields)

Note: the `DNA` type includes some fields that are **persisted for legacy import/export and future experiments** but are not yet used by the current ECS systems. Those are marked as “(not yet wired)” below.

**Identity**
- `archetype`: `"hunter" | "prey" | "plant" | "scavenger"` (this app currently spawns hunters + prey; plants are separate entities)
- `biome`: `"land" | "water" | "air"`
- `familyColor`: used for family grouping + rendering tint

**Movement & navigation**
- `baseSpeed`: baseline movement speed (modified by mode, stamina, fat load, and optional body-plan locomotion)
- `turnRate`: base turning responsiveness (used by the movement system, and modulated by body-plan agility when enabled)
- `attentionSpan`: target retention; higher values make agents keep their current target unless a better candidate is clearly better
- `lingerRate`: target stickiness; higher values make agents less likely to switch targets when candidates are similarly attractive

**Senses & stealth**
- `visionRange`: detection radius baseline (or derived from `bodyPlan.senses` when enabled)
- `awareness`: sensitivity / threat weighting baseline (or derived from `bodyPlan.senses` when enabled)
- `camo`: (not yet wired) reserved for future stealth/visibility tuning

**Energy & survival**
- `metabolism`: baseline energy drain (also used as a scaling reference for hunger/behavior thresholds)
- `hungerThreshold`: hunger cutoff used by the worker’s hunger logic (falls back to `Energy.metabolism * 8` when missing)
- `fatCapacity`: max fat storage (also used as a proxy for “size” in some interactions)
- `fatBurnThreshold`: threshold (legacy: `store_using_threshold`) above which sleeping agents can burn fat into energy
- `bodyMass`: impacts birth cost and the way weight changes visual size
- `senseUpkeep`: extra energy drain for maintaining senses (derived from `bodyPlan.senses` when enabled)

**Temperament & social**
- `aggression`: willingness to attack/hunt; also influences combat rolls
- `bravery`: willingness to face threats instead of fleeing
- `fear`: baseline threat sensitivity
- `cowardice`: flee reflex strength (used to compare against perceived threat)
- `cohesion`: flocking / social stickiness (how strongly agents pull toward nearby allies)
- `curiosity`: exploration jitter and willingness to roam; also influences foraging radius
- `moodStability`: how noisy/stable mood transitions are under stress

**Threat modeling / escape**
- `dangerRadius`: how close threats can get before triggering panic behaviors
- `escapeTendency`: how easily danger triggers an immediate flee response
- `escapeDuration`: base flee persistence duration (feeds into `dangerTimer`)
- `speciesFear`: fear weighting toward other species
- `conspecificFear`: fear weighting toward same-species non-family
- `sizeFear`: fear weighting based on opponent size (fatCapacity as a proxy)

**Combat**
- `power`: attack strength
- `defence`: damage mitigation factor
- `fightPersistence`: influences whether agents stand and fight or flee under survival pressure (fed into the mood/decision model)

**Reproduction**
- `libidoThreshold`: libido needed to attempt mating
- `libidoGainRate`: per-agent libido gain rate (used to increase libido over time)
- `fertility`: probability of a successful conception when mating conditions are met
- `gestationCost`: energy cost paid during mating and at birth; also increases gestation duration
- `mutationRate`: heritable modifier applied to the global UI mutation rate (`controls.mutationRate`) during crossover
- `dependency`: how strongly juveniles follow a parent
- `independenceAge`: how long juveniles remain in the dependency window
- `stamina`: influences movement boosts and reduces fatigue/metabolic strain
- `circadianBias`: day/night preference bias for sleep pressure
- `sleepEfficiency`: recovery rate while sleeping
- `patrolThreshold`: used as an energy cutoff for hungry agents without a target (below it they roam/search in `patrol` rather than “committing” to `hunt`)
- `preferredFood`: diet list used by perception/foraging (enforced by archetype for hunters/prey via `prepareDNA`)
- `scavengerAffinity`: reserved for the scavenger archetype (set to `0` for hunters/prey by `prepareDNA`)

### Body plan DNA (anatomy)

Each animal DNA includes `bodyPlanVersion` and a `bodyPlan` object (see `modern-app/src/types/sim.ts` and `modern-app/src/ecs/bodyPlan.ts`):

- `bodyPlan.chassis`: length/depth/massBias/flexibility/plating (overall silhouette and “build”)
- `bodyPlan.senses`: list of senses (`eye`/`ear`/`nose`/`touch`/`taste`) with `count`, `distribution`, `acuity`
- `bodyPlan.limbs`: `leg` genes (count/size/placement/gaitStyle) and/or `wing` genes (count/span/surface/articulation)
- `bodyPlan.appendages`: `fin`, `tail`, and `muscle-band` genes

By default the sim is conservative: anatomy exists in DNA and is persisted, but you can opt-in to systems using it via feature flags:

- `VITE_FEATURE_SENSES_FROM_DNA=true` derives `visionRange`, `awareness`, and `senseUpkeep` from `bodyPlan.senses`.
- `VITE_FEATURE_LAND_BODY_PLAN=true`, `VITE_FEATURE_AQUATIC_BODY_PLAN=true`, `VITE_FEATURE_AERIAL_BODY_PLAN=true` enable locomotion bonuses derived from legs/fins/wings.

## DNA crossover (how reproduction works)

Mating only happens between **two agents of the same archetype** (hunter↔hunter, prey↔prey) when they are close, off cooldown, have enough energy, and both have libido above their threshold.

When conception succeeds, one parent is picked as the gestating parent and a pregnancy is stored in the worker for a short gestation timer. When the timer reaches zero, a child is spawned near the parent and the parent pays an energy + fat cost.

### Mating & birth rules (current constants)

- Partner search radius: `80`
- Required distance to mate: `<= 28`
- Sex cooldown after mating: `5` seconds
- Energy requirement: `Energy.value >= Energy.metabolism * 1.1`
- Gestation duration: `6 + gestationCost * 0.6` seconds
- Birth cost: `energy -= gestationCost`, `fatStore -= bodyMass * 50`

### Crossing algorithm

Child DNA is generated in `modern-app/src/ecs/systems/reproductionSystem.ts`:

1. **Per-gene inheritance:** for each numeric gene listed in `GENE_KEYS` (`modern-app/src/ecs/genetics.ts`), the child takes either parent A’s value or parent B’s value based on a per-gene dominance weight (`DEFAULT_DOMINANCE`, typically 50/50; `mutationRate` is currently biased).
2. **Discrete picks:** `biome` and `familyColor` are picked 50/50 from either parent.
3. **Body plan inheritance (currently not blended):** the entire `bodyPlan` is cloned from one parent at random (there is no per-limb/sense mixing yet).
4. **Mutation pass (optional):** with probability `controls.mutationRate` scaled by the parents’ `dna.mutationRate`, one numeric gene is mutated (40% reroll to a gene-specific range, otherwise a multiplicative drift of ~`0.8..1.2`). When a mutation triggers, there is also a chance to mutate the body plan (`0.2` land / `0.3` water / `0.35` air); body-plan mutations can tweak senses/legs/fins/wings (legs/fins/wings only if the matching body-plan feature flag is enabled).

The worker records a `mutationMask` bitset on births so the UI can show *which* gene mutated; body-plan tweaks are tracked with an additional high bit.

## Commands

- `npm run dev` – start the dev server
- `npm run build` – build a production bundle into `dist/`
- `npm run preview` – serve the production bundle locally
- `npm run check` – typecheck (`svelte-check` + `tsc`)
- `npm test` – run the smoke suite (movement, reproduction, persistence, legacy)

## Project layout

- `src/worker.ts` – simulation loop + messaging (snapshots/telemetry to UI)
- `src/ecs/` – ECS components/systems/world helpers
- `src/render/` – Pixi renderer and overlays
- `src/state/` – Svelte stores (controls, snapshots, telemetry)
- `tests/` – deterministic smoke tests
- `docs/` – additional design notes

More background docs live at the repo root:

- `../docs/ecs-plan.md`
- `../docs/extending-genes-and-systems.md`
- `../docs/legacy-sim-spec.md`
