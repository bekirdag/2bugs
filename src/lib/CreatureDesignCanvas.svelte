<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  import { CreatureDesignStage } from '@/render/creatureDesignStage'
  import type { CreatureDesignConfig } from '@/types/creatureDesign'
  import type { CreatureVariant } from '@/render/creatureLook'

  export let config: CreatureDesignConfig
  export let variants: CreatureVariant[] = ['hunter', 'prey', 'juvenile']

  let host: HTMLDivElement | null = null
  let stage: CreatureDesignStage | null = null
  let initialized = false

  onMount(async () => {
    if (!host) return
    stage = new CreatureDesignStage()
    await stage.init(host, variants)
    stage.render(config)
    initialized = true
  })

  onDestroy(() => {
    stage?.destroy()
    stage = null
    initialized = false
  })

  $: if (initialized && stage) {
    stage.render(config)
  }
</script>

<div class="canvas-shell">
  <div class="design-stage" bind:this={host} aria-label="Creature prototypes preview"></div>
  <div class="canvas-highlight"></div>
</div>

<style>
  .canvas-shell {
    position: relative;
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    overflow: hidden;
    background: radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.18), transparent 55%),
      radial-gradient(circle at 80% 10%, rgba(248, 113, 113, 0.15), transparent 45%), #020617;
    box-shadow: 0 25px 60px rgba(2, 6, 23, 0.8);
  }

  .design-stage {
    position: relative;
    width: 100%;
    min-height: 360px;
    height: clamp(320px, 52vh, 540px);
  }

  .canvas-highlight {
    pointer-events: none;
    position: absolute;
    inset: 0;
    border-radius: 20px;
    box-shadow: inset 0 0 80px rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
</style>
