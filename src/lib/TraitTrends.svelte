<script lang="ts">
  import { traitHistory } from '@/state/historyStore'
  import type { TraitSample } from '@/state/historyStore'

  const width = 140
  const height = 48

  type MetricKey =
    | 'avgSpeed'
    | 'avgVision'
    | 'avgAggression'
    | 'avgMetabolism'
    | 'avgBodyMass'
    | 'avgAwareness'
    | 'avgEatingGreed'
    | 'avgFatRatio'
    | 'avgAgeYears'

  const metrics: { key: MetricKey; label: string; color: string; digits?: number }[] = [
    { key: 'avgSpeed', label: 'Speed', color: '#f472b6', digits: 0 },
    { key: 'avgVision', label: 'Vision', color: '#38bdf8', digits: 0 },
    { key: 'avgAggression', label: 'Aggression', color: '#fb7185', digits: 2 },
    { key: 'avgMetabolism', label: 'Metabolism', color: '#facc15', digits: 2 },
    { key: 'avgBodyMass', label: 'Body Mass', color: '#34d399', digits: 2 },
    { key: 'avgAwareness', label: 'Awareness', color: '#a78bfa', digits: 2 },
    { key: 'avgEatingGreed', label: 'Eating greed', color: '#fb923c', digits: 2 },
    { key: 'avgFatRatio', label: 'Fat ratio', color: '#f97316', digits: 2 },
    { key: 'avgAgeYears', label: 'Age (years)', color: '#60a5fa', digits: 1 },
  ]

  $: history = $traitHistory

  const format = (value: number | undefined, digits = 1) =>
    value === undefined ? '—' : value.toFixed(digits)

  const buildPath = (samples: TraitSample[], key: MetricKey) => {
    if (!samples.length) return ''
    const values = samples.map((sample) => sample[key])
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    return samples
      .map((sample, index) => {
        const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * width
        const normalized = (sample[key] - min) / range
        const y = height - normalized * height
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }
</script>

<section class="trait-trends">
  <header>
    <div>
      <h2>Trait Trends</h2>
      <p>Rolling averages over the last {history.length} ticks</p>
    </div>
  </header>
  {#if history.length === 0}
    <p class="muted">Charts will appear after the simulation runs.</p>
  {:else}
    <div class="charts">
      {#each metrics as metric}
        <div class="chart">
          <div class="chart-head">
            <span>{metric.label}</span>
            <strong>{format(history.at(-1)?.[metric.key], metric.digits ?? 1)}</strong>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <path d={buildPath(history, metric.key)} stroke={metric.color} fill="none" stroke-width="2" />
          </svg>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .trait-trends {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  header h2 {
    margin: 0;
    font-size: 1rem;
  }

  header p {
    margin: 0.1rem 0 0;
    color: #9ca3af;
    font-size: 0.85rem;
  }

  .charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .chart {
    background: rgba(9, 12, 25, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .chart-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #cbd5f5;
  }

  .chart-head strong {
    font-size: 0.95rem;
    color: #f8fafc;
  }

  svg {
    width: 100%;
    height: 60px;
    opacity: 0.95;
  }

  .muted {
    color: #9ca3af;
    font-size: 0.85rem;
  }
</style>
