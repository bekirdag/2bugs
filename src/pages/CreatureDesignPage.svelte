<script lang="ts">
  import CreatureDesignCanvas from '@/lib/CreatureDesignCanvas.svelte'
  import { CREATURE_DESIGN_DEFAULT } from '@/config/creatureDesignDefaults'
  import type { CreatureDesignConfig, CreaturePatternStyle } from '@/types/creatureDesign'
  import type { CreatureVariant } from '@/render/creatureLook'

  type ConfigKey = 'hunter' | 'prey'

  type BiomeKey = 'land' | 'water' | 'air'

  type SliderKey =
    | 'silhouetteStretch'
    | 'torsoDepth'
    | 'headCrest'
    | 'platingStrength'
    | 'tailLength'
    | 'lumens'

  type SliderSpec = {
    key: SliderKey
    label: string
    description: string
    min?: number
    max?: number
    step?: number
  }

  const sliderConfig: Record<ConfigKey, SliderSpec[]> = {
    hunter: [
      {
        key: 'silhouetteStretch',
        label: 'Stride length',
        description: 'Pushes the torso longer to imply reach advantage.',
        min: 0.4,
        max: 1,
      },
      {
        key: 'headCrest',
        label: 'Predator crest',
        description: 'Crest height + cranial horns for intimidation.',
      },
      {
        key: 'platingStrength',
        label: 'Blade plating',
        description: 'Controls how many dorsal razors we show.',
      },
      {
        key: 'tailLength',
        label: 'Tail rudder',
        description: 'Longer rudders read as agile hunters.',
      },
      {
        key: 'lumens',
        label: 'Targeting glow',
        description: 'Emissive elements around sensors and mandibles.',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    prey: [
      {
        key: 'torsoDepth',
        label: 'Mass / forage belly',
        description: 'Rounder bellies make grazers feel nutrient rich.',
      },
      {
        key: 'silhouetteStretch',
        label: 'Stride reach',
        description: 'Shorter silhouettes feel sturdy and cautious.',
        min: 0.2,
        max: 0.8,
      },
      {
        key: 'headCrest',
        label: 'Ear crest',
        description: 'More crest height implies better awareness.',
      },
      {
        key: 'tailLength',
        label: 'Balance tail',
        description: 'Short stubs keep them grounded; long tails show alertness.',
      },
      {
        key: 'lumens',
        label: 'Herd glow',
        description: 'Subtle bioluminescence so packs spot each other.',
        min: 0,
        max: 0.7,
        step: 0.01,
      },
    ],
  }

  const biomeLabels: Record<BiomeKey, string> = {
    land: 'Land',
    water: 'Sea / Water',
    air: 'Flying',
  }

  const biomeTabs: BiomeKey[] = ['land', 'water', 'air']

  const patternOptions: Array<{ value: CreaturePatternStyle; label: string }> = [
    { value: 'stripes', label: 'Ridged stripes' },
    { value: 'dapples', label: 'Dappled fur' },
    { value: 'spines', label: 'Spine plates' },
  ]

  const legendCopy: Record<'hunter' | 'prey' | 'juvenile', string> = {
    hunter: 'Elongated chassis, heavier plating, tail fins for steering.',
    prey: 'Rounded mass, lower crest and dappled patterns for camouflage.',
    juvenile: 'Compact proportions with soft glow that can grow as they age.',
  }

  type DesignBoard = {
    key: ConfigKey
    label: string
    focus: string
    variants: CreatureVariant[]
  }

  const designBoards: DesignBoard[] = [
    {
      key: 'hunter',
      label: 'Hunter prototypes',
      focus: 'Wiry pursuit frames, readable aggression cues',
      variants: ['hunter'],
    },
    {
      key: 'prey',
      label: 'Prey prototypes',
      focus: 'Rounded silhouettes for herd readability',
      variants: ['prey'],
    },
  ]

  const ideaList = [
    'Separate silhouettes let us map body plans to archetypes without touching ECS systems yet.',
    'Tail leverage + plating strength could later read directly from aggression / stamina genes.',
    'High crest + lumens combination gives a nice “alpha display”, useful for hierarchy cues.',
  ]

  const formatLabel = (label: string) => label.charAt(0).toUpperCase() + label.slice(1)

  const baseConfig: CreatureDesignConfig = { ...CREATURE_DESIGN_DEFAULT }

  const createConfig = (overrides: Partial<CreatureDesignConfig>) => ({
    ...baseConfig,
    ...overrides,
  })

  let creatureConfigs: Record<ConfigKey, Record<BiomeKey, CreatureDesignConfig>> = {
    hunter: {
      land: createConfig({
        silhouetteStretch: 0.78,
        headCrest: 0.52,
        tailLength: 0.82,
        patternStyle: 'spines',
        accentColor: '#fb7185',
        glowColor: '#fee440',
      }),
      water: createConfig({
        silhouetteStretch: 0.92,
        torsoDepth: 0.46,
        headCrest: 0.35,
        tailLength: 0.9,
        platingStrength: 0.48,
        patternStyle: 'stripes',
        coreColor: '#0ea5e9',
        accentColor: '#f472b6',
        glowColor: '#c4f1f9',
        lumens: 0.6,
      }),
      air: createConfig({
        silhouetteStretch: 0.85,
        torsoDepth: 0.38,
        headCrest: 0.6,
        tailLength: 0.58,
        patternStyle: 'spines',
        accentColor: '#fbbf24',
        glowColor: '#fff7ae',
        lumens: 0.72,
      }),
    },
    prey: {
      land: createConfig({
        silhouetteStretch: 0.46,
        torsoDepth: 0.72,
        headCrest: 0.35,
        tailLength: 0.55,
        patternStyle: 'dapples',
        coreColor: '#60a5fa',
        accentColor: '#fef9c3',
        glowColor: '#a5f3fc',
      }),
      water: createConfig({
        silhouetteStretch: 0.52,
        torsoDepth: 0.6,
        headCrest: 0.28,
        tailLength: 0.68,
        patternStyle: 'stripes',
        coreColor: '#38bdf8',
        accentColor: '#c4b5fd',
        glowColor: '#a7f3d0',
        lumens: 0.4,
      }),
      air: createConfig({
        silhouetteStretch: 0.65,
        torsoDepth: 0.45,
        headCrest: 0.42,
        tailLength: 0.5,
        patternStyle: 'dapples',
        coreColor: '#a5b4fc',
        accentColor: '#fde68a',
        glowColor: '#bae6fd',
        lumens: 0.55,
      }),
    },
  }

  let activeBiomes: Record<ConfigKey, BiomeKey> = {
    hunter: 'land',
    prey: 'land',
  }

  const metricsFor = (config: CreatureDesignConfig) => [
    {
      label: 'Stride vs mass',
      description: 'How fast the creature reads; mixes stretch and torso mass.',
      value: Math.round((config.silhouetteStretch * 0.65 + (1 - config.torsoDepth) * 0.35) * 100),
    },
    {
      label: 'Display energy',
      description: 'Crest + luminance hints at intimidation or mating displays.',
      value: Math.round((config.headCrest * 0.55 + config.lumens * 0.45) * 100),
    },
    {
      label: 'Armor bias',
      description: 'Tail + plating values read as offensive / defensive capability.',
      value: Math.round((config.platingStrength * 0.6 + config.tailLength * 0.4) * 100),
    },
  ]

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`

  const updateConfig = (key: ConfigKey, biome: BiomeKey, patch: Partial<CreatureDesignConfig>) => {
    creatureConfigs = {
      ...creatureConfigs,
      [key]: {
        ...creatureConfigs[key],
        [biome]: { ...creatureConfigs[key][biome], ...patch },
      },
    }
  }

  const handleSlider = (configKey: ConfigKey, biome: BiomeKey, key: SliderSpec['key'], event: Event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value)
    updateConfig(configKey, biome, { [key]: value } as Partial<CreatureDesignConfig>)
  }

  const handlePatternChange = (configKey: ConfigKey, biome: BiomeKey, event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value as CreaturePatternStyle
    updateConfig(configKey, biome, { patternStyle: value })
  }

  const handleColorChange = (
    configKey: ConfigKey,
    biome: BiomeKey,
    key: 'coreColor' | 'accentColor' | 'glowColor',
    event: Event,
  ) => {
    const value = (event.currentTarget as HTMLInputElement).value
    updateConfig(configKey, biome, { [key]: value } as Partial<CreatureDesignConfig>)
  }

  const setActiveBiome = (configKey: ConfigKey, biome: BiomeKey) => {
    activeBiomes = { ...activeBiomes, [configKey]: biome }
  }

  const goToSimulationHome = () => {
    window.location.href = '/'
  }
</script>

<svelte:head>
  <title>Creature Design Lab</title>
</svelte:head>

<section class="creature-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">Creature Lab · Workbench prototype</p>
      <h1>Designing animal silhouettes before shipping them into the sim</h1>
      <p class="lede">
        We are keeping the actual simulation untouched for now. This page is a sandbox where we can use PixiJS to
        experiment with layered graphics, test palettes, and agree on a look that feels less abstract than squares and
        circles.
      </p>
    </div>
    <button class="ghost-link" type="button" on:click={goToSimulationHome}>Simulation home</button>
  </header>

  <div class="design-grid">
    <div class="canvas-panel">
      {#each designBoards as board}
        <article class="board-card">
          <div class="board-header">
            <div>
              <p class="board-title">{board.label}</p>
              <p class="board-focus">{board.focus}</p>
              <p class="board-copy">{legendCopy[board.key]}</p>
            </div>
            <span class="board-badge">{formatLabel(board.key)}</span>
          </div>
          <div class="biome-tabs">
            {#each biomeTabs as biome}
              <button
                type="button"
                class:active={activeBiomes[board.key] === biome}
                on:click={() => setActiveBiome(board.key, biome)}
              >
                {biomeLabels[biome]}
              </button>
            {/each}
          </div>
          <CreatureDesignCanvas config={creatureConfigs[board.key][activeBiomes[board.key]]} variants={board.variants} />
        </article>
      {/each}
    </div>

    <div class="control-panel">
      {#each designBoards as board}
        <section class="control-card">
          <header>
            <div>
              <p class="eyebrow small">{board.label}</p>
              <h2>{biomeLabels[activeBiomes[board.key]]}</h2>
            </div>
            <span class="board-badge subtle">{formatLabel(board.key)}</span>
          </header>
          <div class="biome-tabs compact">
            {#each biomeTabs as biome}
              <button
                type="button"
                class:active={activeBiomes[board.key] === biome}
                on:click={() => setActiveBiome(board.key, biome)}
              >
                {biomeLabels[biome]}
              </button>
            {/each}
          </div>
          <div class="metrics-mini">
            {#each metricsFor(creatureConfigs[board.key][activeBiomes[board.key]]) as metric}
              <article>
                <div class="metric-head">
                  <span>{metric.label}</span>
                  <strong>{metric.value}%</strong>
                </div>
                <div class="metric-bar small">
                  <span style={`--value: ${metric.value}%`}></span>
                </div>
              </article>
            {/each}
          </div>
          {#each sliderConfig[board.key] as slider}
            <label class="slider-field">
              <div class="label-row">
                <span>{slider.label}</span>
                <span class="value">
                  {formatPercent(Number(creatureConfigs[board.key][activeBiomes[board.key]][slider.key] ?? 0))}
                </span>
              </div>
              <input
                type="range"
                min={slider.min ?? 0}
                max={slider.max ?? 1}
                step={slider.step ?? 0.01}
                value={creatureConfigs[board.key][activeBiomes[board.key]][slider.key]}
                on:input={(event) => handleSlider(board.key, activeBiomes[board.key], slider.key, event)}
              />
              <small>{slider.description}</small>
            </label>
          {/each}
          <div class="color-grid">
            <label>
              <span>Core color</span>
              <input
                type="color"
                value={creatureConfigs[board.key][activeBiomes[board.key]].coreColor}
                on:input={(event) => handleColorChange(board.key, activeBiomes[board.key], 'coreColor', event)}
              />
            </label>
            <label>
              <span>Accent color</span>
              <input
                type="color"
                value={creatureConfigs[board.key][activeBiomes[board.key]].accentColor}
                on:input={(event) => handleColorChange(board.key, activeBiomes[board.key], 'accentColor', event)}
              />
            </label>
            <label>
              <span>Glow color</span>
              <input
                type="color"
                value={creatureConfigs[board.key][activeBiomes[board.key]].glowColor}
                on:input={(event) => handleColorChange(board.key, activeBiomes[board.key], 'glowColor', event)}
              />
            </label>
          </div>
          <label class="pattern-field">
            <span>Pattern style</span>
            <select
              value={creatureConfigs[board.key][activeBiomes[board.key]].patternStyle}
              on:change={(event) => handlePatternChange(board.key, activeBiomes[board.key], event)}
            >
              {#each patternOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        </section>
      {/each}
    </div>
  </div>

  <section class="insight-panel">
    <div class="notes">
      <h3>What we’re testing here</h3>
      <ul>
        {#each ideaList as idea}
          <li>{idea}</li>
        {/each}
      </ul>
    </div>
    <div class="metrics">
      <h3>Readability heuristics</h3>
      {#each designBoards as board}
        <article>
          <div class="metric-head">
            <span>{board.label}</span>
            <strong>Biome breakdown</strong>
          </div>
          {#each biomeTabs as biome}
            <div class="metric-biome">
              <p class="metric-biome-label">{biomeLabels[biome]}</p>
              {#each metricsFor(creatureConfigs[board.key][biome]) as metric}
                <div class="metric-row">
                  <div class="metric-description">{metric.label}</div>
                  <div class="metric-value">{metric.value}%</div>
                  <div class="metric-bar tight">
                    <span style={`--value: ${metric.value}%`}></span>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </article>
      {/each}
    </div>
  </section>
</section>

<style>
  :global(body) {
    background: radial-gradient(circle at 20% 20%, rgba(8, 47, 73, 0.4), transparent 40%), #030711;
  }

  .creature-page {
    min-height: 100vh;
    padding: clamp(1.5rem, 3vw, 3rem);
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
    color: #e2e8f0;
    max-width: 1280px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    justify-content: space-between;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0 0 0.5rem;
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: clamp(1.8rem, 3vw, 2.6rem);
  }

  .lede {
    margin: 0;
    color: #cbd5f5;
    max-width: 48ch;
    line-height: 1.6;
  }

  .ghost-link {
    border: 1px solid rgba(148, 163, 184, 0.5);
    padding: 0.65rem 1.4rem;
    border-radius: 999px;
    text-decoration: none;
    color: inherit;
    font-size: 0.9rem;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .design-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 2rem;
    align-items: flex-start;
  }

  .canvas-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .board-card {
    padding: 1.2rem;
    border-radius: 18px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(3, 7, 18, 0.8);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .board-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .board-title {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    color: #93c5fd;
  }

  .board-focus {
    margin: 0;
    font-weight: 600;
  }

  .board-copy {
    margin: 0.2rem 0 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .board-badge {
    border: 1px solid rgba(148, 163, 184, 0.45);
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: #bef8fd;
    align-self: flex-start;
  }

  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: rgba(2, 6, 23, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    padding: 1.5rem;
  }

  .biome-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .biome-tabs button {
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: transparent;
    color: inherit;
    border-radius: 999px;
    padding: 0.3rem 0.9rem;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    cursor: pointer;
  }

  .biome-tabs button.active {
    border-color: #38bdf8;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .biome-tabs.compact {
    margin-bottom: 0.85rem;
  }

  .control-card {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 16px;
    padding: 1.25rem;
    background: rgba(15, 23, 42, 0.6);
  }

  .control-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .control-card h2 {
    margin: 0;
    font-size: 1rem;
    color: #e2e8f0;
  }

  .eyebrow.small {
    font-size: 0.7rem;
  }

  .board-badge.subtle {
    color: #bae6fd;
    border-color: rgba(148, 163, 184, 0.35);
  }

  .metrics-mini {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .metrics-mini article {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 10px;
    padding: 0.6rem 0.75rem;
    background: rgba(2, 6, 23, 0.65);
  }

  .metric-bar.small {
    height: 4px;
    margin-top: 0.35rem;
  }

  .control-panel h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .slider-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.9rem;
  }

  .slider-field small {
    color: #9ca3af;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .label-row .value {
    color: #38bdf8;
    font-weight: 600;
  }

  input[type='range'] {
    width: 100%;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .color-grid label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
  }

  .color-grid input[type='color'] {
    width: 100%;
    height: 38px;
    border: none;
    border-radius: 10px;
    background: transparent;
  }

  .pattern-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .pattern-field select {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 10px;
    padding: 0.5rem;
    color: inherit;
  }

  .insight-panel {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 1.5rem;
  }

  .notes,
  .metrics {
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 18px;
    padding: 1.5rem;
    background: rgba(2, 6, 23, 0.85);
  }

  .notes h3,
  .metrics h3 {
    margin: 0 0 1rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
    font-size: 0.95rem;
  }

  .notes ul {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    color: #cbd5f5;
  }

  .metrics article {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .metrics article:last-child {
    margin-bottom: 0;
    border-bottom: none;
  }

  .metric-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .metric-description {
    font-size: 0.85rem;
    color: #9ca3af;
    margin: 0.4rem 0;
  }

  .metric-bar {
    position: relative;
    height: 6px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    overflow: hidden;
  }

  .metric-bar span {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #22d3ee, #818cf8);
    width: var(--value);
  }

  .metric-row {
    display: grid;
    grid-template-columns: 1.3fr auto;
    gap: 0.5rem;
    align-items: center;
    margin: 0.35rem 0;
  }

  .metric-row .metric-bar.tight {
    grid-column: span 2;
    height: 4px;
    margin-top: -0.2rem;
  }

  .metric-value {
    font-weight: 600;
    color: #38bdf8;
  }

  .metric-biome {
    margin: 0.75rem 0;
    padding: 0.5rem 0 0;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
  }

  .metric-biome-label {
    margin: 0 0 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  @media (max-width: 1100px) {
    .design-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .control-panel {
      order: -1;
    }

    .insight-panel {
      grid-template-columns: minmax(0, 1fr);
    }

    .page-header {
      flex-direction: column;
    }
  }
</style>
