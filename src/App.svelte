<script lang="ts">
  import { get } from 'svelte/store'
  import { controlStore, togglePause, updateControls } from '@/state/controlStore'
  import { deleteSnapshot, renameSnapshot, saveStatusStore, snapshotsStore } from '@/state/persistence'
  import { loadSnapshotById, loadSnapshotDirect, requestWorldSave, resetWorld } from '@/state/simController'
  import { latestSnapshot, simStats } from '@/state/simStore'
  import { pixiStage } from '@/render/pixiStage'
  import TraitTrends from '@/lib/TraitTrends.svelte'
  import { legacyPhpToSnapshot, snapshotToLegacyPhp } from '@/utils/legacyAdapter'
  import { notableAgentsStore, traitHistory, historyToCSV } from '@/state/historyStore'
  import { MODE_LEGEND, type SavedSnapshot } from '@/types/sim'
  import { telemetryStore } from '@/state/telemetryStore'
  import type { TelemetryData } from '@/state/telemetryStore'
  import { biomeMutationTally, mutationEvents, type MutationEvent } from '@/state/mutationStore'
  import type { GeneKey } from '@/ecs/genetics'

  const SIDEBAR_WIDTH = 340
  const LAYOUT_GAP = 1

  const formatNumber = (value: number, digits = 0) => value.toFixed(digits)
  const geneLabels: Record<string, string> = {
    speed: 'Speed',
    vision: 'Vision',
    aggression: 'Aggression',
    stamina: 'Stamina',
    scavenger: 'Scavenger',
    metabolism: 'Metabolism',
    awareness: 'Awareness',
  }
  const mutationGeneLabels: Record<GeneKey, string> = {
    baseSpeed: 'Speed',
    visionRange: 'Vision',
    hungerThreshold: 'Hunger threshold',
    fatCapacity: 'Fat capacity',
    fatBurnThreshold: 'Burn threshold',
    patrolThreshold: 'Patrol threshold',
    aggression: 'Aggression',
    bravery: 'Bravery',
    power: 'Power',
    defence: 'Defence',
    fightPersistence: 'Fight persistence',
    escapeTendency: 'Escape tendency',
    escapeDuration: 'Escape duration',
    lingerRate: 'Linger rate',
    dangerRadius: 'Danger radius',
    attentionSpan: 'Attention span',
    libidoThreshold: 'Libido threshold',
    libidoGainRate: 'Libido gain rate',
    mutationRate: 'Mutation rate',
    bodyMass: 'Body mass',
    metabolism: 'Metabolism',
    turnRate: 'Turn rate',
    curiosity: 'Curiosity',
    cohesion: 'Cohesion',
    fear: 'Fear',
    camo: 'Camouflage',
    awareness: 'Awareness',
    fertility: 'Fertility',
    gestationCost: 'Gestation cost',
    moodStability: 'Mood stability',
    cowardice: 'Cowardice',
    speciesFear: 'Other species fear',
    conspecificFear: 'Conspecific fear',
    dependency: 'Dependency',
    independenceAge: 'Independence age',
    sizeFear: 'Size fear',
    stamina: 'Stamina',
    circadianBias: 'Circadian bias',
    sleepEfficiency: 'Sleep efficiency',
    scavengerAffinity: 'Scavenger affinity',
  }

  let snapshots: SavedSnapshot[] = []
  let notableAgents = []
  let saveName = ''
  let gridEnabled = false
  let selectedFamily = ''
  let agentQuery = ''
  let telemetry: TelemetryData | null = null
  let fps = 0
  let mutationFeed: MutationEvent[] = []
  let mutationCounts: Record<string, number> = {}
  let bodyPlanMutationCount = 0
  let legacyStatus: { state: 'idle' | 'success' | 'error'; message: string } = {
    state: 'idle',
    message: '',
  }

  $: controls = $controlStore
  $: snapshot = $latestSnapshot
  $: stats = $simStats
  $: snapshots = $snapshotsStore
  $: saveStatus = $saveStatusStore
  $: hunters = snapshot ? snapshot.agents.filter((agent) => agent.dna.archetype === 'hunter').length : 0
  $: prey = snapshot ? snapshot.agents.filter((agent) => agent.dna.archetype === 'prey').length : 0
  $: notableAgents = $notableAgentsStore
  $: mutationFeed = $mutationEvents
  $: mutationCounts = $biomeMutationTally
  $: bodyPlanMutationCount = mutationFeed.filter((event) => event.bodyPlanChanged).length
$: {
  const latestTelemetry = $telemetryStore
  if (latestTelemetry) {
    telemetry = latestTelemetry
    fps = latestTelemetry.fps ?? fps
  }
}
$: pixiStage.setDebugOverlay?.(controls.debugOverlay)
$: pixiStage.setLightweightVisuals?.(controls.lightweightVisuals)
  $: familyOptions =
    snapshot
      ? Object.values(
          snapshot.agents.reduce<Record<string, { color: string; count: number }>>((acc, agent) => {
            const color = agent.dna.familyColor
            if (!acc[color]) {
              acc[color] = { color, count: 0 }
            }
            acc[color].count += 1
            return acc
          }, {}),
        )
      : []

  const handleSpeed = (event: Event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value)
    updateControls({ speed: value })
  }

  const handleMaxAgents = (event: Event) => {
    updateControls({ maxAgents: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleMaxPlants = (event: Event) => {
    updateControls({ maxPlants: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleMutationRate = (event: Event) => {
    updateControls({ mutationRate: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleFlockingStrength = (event: Event) => {
    updateControls({ flockingStrength: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleCuriosityBias = (event: Event) => {
    updateControls({ curiosityBias: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleAggressionBias = (event: Event) => {
    updateControls({ aggressionBias: Number((event.currentTarget as HTMLInputElement).value) })
  }

  const handleDebugOverlayToggle = (event: Event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked
    updateControls({ debugOverlay: enabled })
    pixiStage.setDebugOverlay(enabled)
  }

  const handleLightweightToggle = (event: Event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked
    updateControls({ lightweightVisuals: enabled })
    pixiStage.setLightweightVisuals(enabled)
  }

  const handleSaveWorld = () => {
    const label = saveName.trim() || `World ${new Date().toLocaleString()}`
    requestWorldSave(label)
    saveName = ''
  }

  const handleLoadSnapshot = (id: string) => {
    loadSnapshotById(id)
  }

  const handleLegacyImport = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const snapshot = legacyPhpToSnapshot(text)
      loadSnapshotDirect(snapshot)
      legacyStatus = { state: 'success', message: 'Legacy world loaded' }
    } catch (error) {
      console.error(error)
      legacyStatus = { state: 'error', message: 'Import failed' }
    } finally {
      input.value = ''
      setTimeout(() => {
        legacyStatus = { state: 'idle', message: '' }
      }, 3000)
    }
  }

  const handleLegacyExport = () => {
    if (!snapshot) {
      legacyStatus = { state: 'error', message: 'No snapshot to export' }
      setTimeout(() => (legacyStatus = { state: 'idle', message: '' }), 2000)
      return
    }
    const payload = snapshotToLegacyPhp(snapshot)
    const blob = new Blob([payload], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `legacy-save-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    legacyStatus = { state: 'success', message: 'Legacy file exported' }
    setTimeout(() => (legacyStatus = { state: 'idle', message: '' }), 2000)
  }


  const handleTraitExport = () => {
    const samples = get(traitHistory)
    if (!samples.length) {
      legacyStatus = { state: 'error', message: 'No trait history yet' }
      setTimeout(() => (legacyStatus = { state: 'idle', message: '' }), 2000)
      return
    }
    const csv = historyToCSV(samples)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trait-history-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    legacyStatus = { state: 'success', message: 'Trait history exported' }
    setTimeout(() => (legacyStatus = { state: 'idle', message: '' }), 2000)
  }

  const handleFitView = () => {
    pixiStage.fitToScreen()
  }

  const handleResetWorld = () => {
    resetWorld()
    saveName = ''
    selectedFamily = ''
    agentQuery = ''
    updateControls({ maxAgents: 1080, maxPlants: 900 })
  }

  const handleZoomIn = () => {
    pixiStage.zoomIn()
  }

  const handleZoomOut = () => {
    pixiStage.zoomOut()
  }

  const toggleGrid = () => {
    gridEnabled = !gridEnabled
    pixiStage.setGridVisible(gridEnabled)
  }

  const handleFocusFamily = () => {
    if (selectedFamily) {
      pixiStage.focusOnFamily(selectedFamily)
    }
  }

  const handleFocusMutation = (id: number) => {
    pixiStage.focusOnAgent(id)
    agentQuery = String(id)
  }

  const openCreatureDesignLab = () => {
    window.open('/creature_design', '_blank', 'noopener,noreferrer')
  }
</script>

<main class="layout" style={`--sidebar-width: ${SIDEBAR_WIDTH}px; --layout-gap: ${LAYOUT_GAP}px;`}>
  <section class="viewport">
    <div id="sim-canvas" aria-label="Simulation viewport"></div>
    <div class="hud">
      <div>
        <span class="label">Tick</span>
        <span class="value">{stats.tick}</span>
      </div>
      <div>
        <span class="label">Agents</span>
        <span class="value">{stats.agents}</span>
      </div>
      <div>
        <span class="label">Plants</span>
        <span class="value">{stats.plants}</span>
      </div>
      <div>
        <span class="label">FPS</span>
        <span class="value">{fps || '—'}</span>
      </div>
    </div>

  </section>
  <section class="panel">
    <header>
      <h1>Habitat Console</h1>
      <div class="panel-actions">
        <button class="ghost" on:click={togglePause}>
          {controls.paused ? 'Resume' : 'Pause'}
        </button>
        <button class="ghost" on:click={handleResetWorld}>Reset world</button>
        <button class="ghost" type="button" on:click={openCreatureDesignLab}>Creature design</button>
      </div>
    </header>
    <div class="view-controls">
      <div class="button-row">
        <button on:click={handleZoomIn}>Zoom +</button>
        <button on:click={handleZoomOut}>Zoom −</button>
        <button on:click={handleFitView}>Fit</button>
        <button class:grid-active={gridEnabled} on:click={toggleGrid}>
          {gridEnabled ? 'Hide Grid' : 'Show Grid'}
        </button>
      </div>
      <div class="focus-row">
        <label>
          Focus family
          <select bind:value={selectedFamily} on:change={handleFocusFamily}>
            <option value="">All</option>
            {#each familyOptions as family}
              <option value={family.color}>
                {family.color} ({family.count})
              </option>
            {/each}
          </select>
        </label>
        <button on:click={handleFocusFamily} disabled={!selectedFamily}>Focus</button>
      </div>
      <div class="focus-row notable-row">
        <label>
          Notable agents
          <select on:change={(event) => {
            const value = Number((event.currentTarget as HTMLSelectElement).value)
            if (!Number.isNaN(value)) {
              pixiStage.focusOnAgent(value)
            }
          }}>
            <option value="">Select...</option>
            {#each notableAgents as agent}
              <option value={agent.id}>
                {agent.label} ({agent.description})
              </option>
            {/each}
          </select>
        </label>
      </div>

      <div class="focus-row">
        <label>
          Jump to agent ID
          <input
            type="number"
            min="1"
            placeholder="e.g. 123"
            bind:value={agentQuery}
            on:keydown={(event) => {
              if (event.key === 'Enter') {
                const targetId = Number(agentQuery)
                if (!Number.isNaN(targetId)) {
                  pixiStage.focusOnAgent(targetId)
                }
              }
            }}
          />
        </label>
        <button
          on:click={() => {
            const targetId = Number(agentQuery)
            if (!Number.isNaN(targetId)) {
              pixiStage.focusOnAgent(targetId)
            }
          }}
          disabled={!agentQuery}
        >
          Jump
        </button>
      </div>
    </div>
    <div class="stat-grid">
      <div>
        <span class="label">Hunters</span>
        <span class="value accent">{hunters}</span>
      </div>
      <div>
        <span class="label">Prey</span>
        <span class="value accent">{prey}</span>
      </div>
      <div>
        <span class="label">Avg Energy</span>
        <span class="value">{formatNumber(stats.avgEnergy, 1)}</span>
      </div>
      <div>
        <span class="label">Mutations</span>
        <span class="value">{stats.mutations}</span>
      </div>
      <div>
        <span class="label">Births</span>
        <span class="value">{stats.births}</span>
      </div>
      <div>
        <span class="label">Deaths</span>
        <span class="value">{stats.deaths}</span>
      </div>
    </div>

    <section class="telemetry-card trait-card">
      <TraitTrends />
    </section>

    <section class="telemetry-card">
      <h2>System timings</h2>
      {#if telemetry}
        <div class="timing-grid">
          {#each Object.entries(telemetry.timings) as [label, value]}
            <div class="timing-row">
              <span>{label}</span>
              <span>{value.toFixed(2)} ms</span>
            </div>
          {/each}
        </div>
        <h3>Gene averages</h3>
        <div class="timing-grid">
          {#each Object.entries(geneLabels) as [key, label]}
            <div class="timing-row">
              <span>{label}</span>
              <span>{telemetry.geneAverages[key]?.toFixed(1) ?? '—'}</span>
            </div>
          {/each}
          <div class="timing-row">
            <span>Stride/Fins/Wings</span>
            <span>
              {telemetry.geneAverages.stride?.toFixed(1) ?? '—'} /
              {telemetry.geneAverages.fins?.toFixed(1) ?? '—'} /
              {telemetry.geneAverages.wings?.toFixed(1) ?? '—'}
            </span>
          </div>
        </div>
      {:else}
        <p class="muted">Telemetry warming up…</p>
      {/if}
    </section>

    <section class="telemetry-card mutation-card">
      <div class="mutation-header">
        <div>
          <h2>Recent mutations</h2>
          <p class="muted small">Body-plan tags highlight limb/fin/wing shifts.</p>
        </div>
        <div class="mutation-tally">
          <span>Land {mutationCounts.land ?? 0}</span>
          <span>Water {mutationCounts.water ?? 0}</span>
          <span>Air {mutationCounts.air ?? 0}</span>
          <span class="body-plan-count">Body plan {bodyPlanMutationCount}</span>
        </div>
      </div>
      {#if mutationFeed.length}
        <ul class="mutation-feed">
          {#each mutationFeed as event}
            <li>
              <button
                class="mutation-row"
                on:click={() => handleFocusMutation(event.id)}
                on:keydown={(evt) => {
                  if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault()
                    handleFocusMutation(event.id)
                  }
                }}
              >
                <div class="mutation-meta">
                  <span class="pill">#{event.id}</span>
                  <span class="pill">{event.archetype} · {event.biome}</span>
                  <span class="pill muted">tick {event.tick}</span>
                  {#if event.bodyPlanChanged}
                    <span class="pill body-plan-pill">Body plan</span>
                  {/if}
                  <span class="color-dot" style={`background:${event.familyColor}`}></span>
                </div>
                <div class="mutation-genes">
                  {#if event.genes.length}
                    {#each event.genes as gene}
                      <span class="pill gene-pill">{mutationGeneLabels[gene] ?? gene}</span>
                    {/each}
                  {:else}
                    <span class="muted">Trait drift only</span>
                  {/if}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No mutations yet.</p>
      {/if}
    </section>

    <section class="behavior-panel">
      <h2>Behaviour tuning</h2>
      <div class="control">
        <label for="flocking-strength">Flocking strength ({controls.flockingStrength.toFixed(2)})</label>
        <input
          id="flocking-strength"
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={controls.flockingStrength}
          on:input={handleFlockingStrength}
        />
      </div>
      <div class="control">
        <label for="curiosity-bias">Curiosity bias ({controls.curiosityBias.toFixed(2)})</label>
        <input
          id="curiosity-bias"
          type="range"
          min="-0.5"
          max="0.5"
          step="0.05"
          value={controls.curiosityBias}
          on:input={handleCuriosityBias}
        />
      </div>
      <div class="control">
        <label for="aggression-bias">Aggression bias ({controls.aggressionBias.toFixed(2)})</label>
        <input
          id="aggression-bias"
          type="range"
          min="-0.3"
          max="0.7"
          step="0.05"
          value={controls.aggressionBias}
          on:input={handleAggressionBias}
        />
      </div>
      <label class="debug-toggle">
        <input type="checkbox" checked={controls.debugOverlay} on:change={handleDebugOverlayToggle} />
        Show debug overlay
      </label>
      <label class="debug-toggle">
        <input type="checkbox" checked={controls.lightweightVisuals} on:change={handleLightweightToggle} />
        Lightweight visuals (hide limbs/fins/wings)
      </label>
    </section>

    <div class="control">
      <label for="speed">Simulation speed ({controls.speed.toFixed(2)}x)</label>
      <input
        id="speed"
        type="range"
        min="0.25"
        max="3"
        step="0.25"
        value={controls.speed}
        on:input={handleSpeed}
      />
    </div>

    <div class="number-row">
      <label>
        Max agents
        <input type="number" min="100" max="20000" value={controls.maxAgents} on:input={handleMaxAgents} />
      </label>
      <label>
        Max plants
        <input type="number" min="100" max="40000" value={controls.maxPlants} on:input={handleMaxPlants} />
      </label>
    </div>

    <div class="control">
      <label for="mutation">Mutation rate ({controls.mutationRate.toFixed(2)})</label>
      <input
        id="mutation"
        type="range"
        min="0.001"
        max="0.1"
        step="0.001"
        value={controls.mutationRate}
        on:input={handleMutationRate}
      />
    </div>

    <div class="snapshot-panel">
      <div class="snapshot-header">
        <div>
          <h2>World Snapshots</h2>
          <small>{snapshots.length}/10 stored</small>
          {#if saveStatus.state !== 'idle'}
            <span class={`status ${saveStatus.state}`}>
              {saveStatus.message}
            </span>
          {/if}
          {#if legacyStatus.state !== 'idle'}
            <span class={`status ${legacyStatus.state}`}>
              {legacyStatus.message}
            </span>
          {/if}
        </div>
        <div class="snapshot-actions">
          <input
            type="text"
            placeholder="Label"
            bind:value={saveName}
            aria-label="Snapshot label"
          />
          <button on:click={handleSaveWorld}>Save</button>
        </div>
      </div>
      <div class="legacy-row">
        <label class="import-btn">
          Import legacy
          <input type="file" accept=".txt,.dat,.sav" on:change={handleLegacyImport} />
        </label>
        <button on:click={handleLegacyExport}>Export legacy</button>
        <button on:click={handleTraitExport}>Export traits CSV</button>
      </div>
      {#if snapshots.length === 0}
        <p class="muted">No snapshots yet.</p>
      {:else}
        <ul class="snapshot-list">
      {#each snapshots as snap}
        <li>
          <div class="snapshot-info">
            <input
              class="rename-input"
              type="text"
              bind:value={snap.label}
              on:change={(event) => renameSnapshot(snap.id, (event.currentTarget as HTMLInputElement).value)}
            />
            <span>{new Date(snap.savedAt).toLocaleString()}</span>
          </div>
          <div class="snapshot-buttons">
            <button on:click={() => handleLoadSnapshot(snap.id)}>Load</button>
            <button class="ghost" on:click={() => deleteSnapshot(snap.id)}>Delete</button>
          </div>
        </li>
      {/each}
        </ul>
      {/if}
    </div>

    <div class="legend">
      {#each MODE_LEGEND as entry}
        <div class="legend-row">
          <span class="swatch" style={`background:${entry.color}`}></span>
          <span>{entry.label}</span>
        </div>
      {/each}
    </div>
  </section>
</main>
