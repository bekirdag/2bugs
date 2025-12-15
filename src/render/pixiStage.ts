import {
  Application,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  Rectangle,
  type Renderer,
} from 'pixi.js'

import type {
  AgentState,
  CorpseState,
  FertilizerState,
  ManureState,
  MoodKind,
  MoodTier,
  PlantState,
  SimulationSnapshot,
  Vector2,
  WorldConfig,
} from '@/types/sim'
import type { CreaturePatternStyle } from '@/types/creatureDesign'
import { CREATURE_DESIGN_DEFAULT } from '@/config/creatureDesignDefaults'
import { VARIANT_PROFILE, computeDimensions, buildPalette, type CreatureDimensions } from '@/render/creatureLook'
import { featureFlags } from '@/config/featureFlags'
import { effectiveFatCapacity } from '@/ecs/lifecycle'
import { generateRocks } from '@/sim/rocks'

type AgentSpriteData = {
  container: Container
  base: Sprite
  accent: Sprite
  glow: Sprite
  overlay: Sprite
  organs: Graphics
  limbs: Graphics
  fins: Graphics
  wings: Graphics
  archetype: 'hunter' | 'prey'
  pulsePhase: number
  wobbleSpeed: number
  gaitPhase: number
  gaitPhaseFromSim: boolean
  lastHeading?: number
  turnIntensity: number
  bodyOffsetX: number
  bodyOffsetY: number
  moveIntensity: number
  landVisuals:
    | {
        dims: CreatureDimensions
        legMounts: { x: number; side: -1 | 1; size: number; gaitStyle: number }[]
        legSize: number
        gaitStyle: number
        tailMounts: { x: number; y: number; angle: number }[]
        tailSize: number
        limbColor: number
      }
    | null
  eyePlacements: { x: number; y: number; angle: number }[]
  earPlacements: { x: number; y: number; angle: number }[]
  nosePlacements: { x: number; y: number; angle: number }[]
  highlightTimeout?: number
  active: boolean // For pooling
}

type PlantSpriteData = {
  sprite: Sprite
  swayPhase: number
  swaySpeed: number
  active: boolean
}

type CorpseSpriteData = {
  sprite: Sprite
  active: boolean
}

type ManureSpriteData = {
  sprite: Sprite
  active: boolean
}

type FertilizerSpriteData = {
  sprite: Sprite
  active: boolean
}

const MODE_COLORS: Record<string, number> = {
  hunt: 0x2563eb,
  flee: 0xdc2626,
  mate: 0xec4899,
  fight: 0x16a34a,
  patrol: 0xf97316,
  graze: 0xf59e0b,
  sleep: 0x6b7280,
  idle: 0x94a3b8,
}

const MOOD_COLORS: Record<MoodKind, number> = {
  panic: 0xef4444,
  starving: 0xf59e0b,
  foraging: 0xfbbf24,
  exhausted: 0x9ca3af,
  'seeking-mate': 0xec4899,
  bonding: 0x22c55e,
  exploring: 0x38bdf8,
  idle: 0xcbd5e1,
}

const TIER_COLORS: Record<MoodTier, number> = {
  survival: 0xb91c1c,
  physiological: 0xf97316,
  reproductive: 0xdb2777,
  social: 0x10b981,
  growth: 0x0284c7,
}

const DEBUG_FLEE_COLOR = 0xff4dd8
const PINK_MASK = 0xff4dd8

const CREATURE_TEXTURE_SCALE = 0.32

export class PixiStage {
  #app?: Application
  #renderer?: Renderer
  #host?: HTMLElement

  // layers
  #camera = new Container()
  #gridLayer = new Graphics()
  #miniMapOverlay = new Graphics()
  #entityLayer = new Container()

  // Data & Pools
  #agentSprites = new Map<number, AgentSpriteData>()
  #agentPool: AgentSpriteData[] = []
  
  #plantSprites = new Map<number, PlantSpriteData>()
  #plantPool: PlantSpriteData[] = []

  #corpseSprites = new Map<number, CorpseSpriteData>()
  #corpsePool: CorpseSpriteData[] = []

  #manureSprites = new Map<number, ManureSpriteData>()
  #manurePool: ManureSpriteData[] = []

  #fertilizerSprites = new Map<number, FertilizerSpriteData>()
  #fertilizerPool: FertilizerSpriteData[] = []

  #rockSprites = new Map<number, Graphics>()
  #rockKey: string | null = null

  #lastSnapshot: SimulationSnapshot | null = null
  #pendingHighlight: number | null = null
  #autoCentered = false
  #lightweightVisuals = false
  #debugMoodOverlay = false
  #debugOrganOverlay = false

  #agentTextures: Record<'hunter' | 'prey', { base: Texture; accent: Texture; glow: Texture; overlay: Texture }> | null =
    null
  #agentDims: Record<'hunter' | 'prey', CreatureDimensions> | null = null
  #accentTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #glowTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #plantTextures: Texture[] = []
  #corpseTexture: Texture | null = null
  #legTexture?: Texture
  #finTexture?: Texture
  #wingTexture?: Texture

  #worldBounds: Vector2 = { x: 1920, y: 1080 }
  #cameraScale = 1
  #minZoom = 0.05
  #maxZoom = 3
  #baseMaxZoom = 3
  #gridVisible = false
  #pendingFit = false
  #pendingFocusAgent: number | null = null
  #pendingFocusFamily: string | null = null
  #isReady = false
  #activePointerId: number | null = null

  // Interaction state
  #isPanning = false
  #lastPointer: { x: number; y: number } | null = null

  async init(host: HTMLElement, worldBounds: Vector2) {
    this.#worldBounds = worldBounds
    this.#host = host
    this.#app = new Application()
    
	    await this.#app.init({
	      background: '#d8c8a0',
	      antialias: true,
	      resizeTo: host,
	      hello: false,
	      preference: 'webgpu',
	      powerPreference: 'high-performance',
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    this.#renderer = this.#app.renderer

    host.innerHTML = ''
    host.appendChild(this.#app.canvas)

    // Setup hierarchy
    this.#camera.interactiveChildren = false
    // All entities share a single layer/canvas container; zIndex controls draw ordering.
    this.#entityLayer.sortableChildren = true
    this.#camera.addChild(this.#gridLayer, this.#entityLayer, this.#miniMapOverlay)
    this.#app.stage.addChild(this.#camera)

    // Layers config
    this.#gridLayer.alpha = 0.45
    this.#miniMapOverlay.visible = false
    this.#miniMapOverlay.eventMode = 'none' // Optimization: Ignore hits

    this.#createTextures()
    this.fitToScreen()
    this.#bindInteractions()
    this.#isReady = true
    this.#applyPendingUiActions()
    
    // Start loop
    this.#app.ticker.add((ticker) => this.#animate(ticker.deltaTime))
  }

  renderSnapshot(snapshot: SimulationSnapshot) {
    if (!this.#app) return
    
    // Only update world bounds if changed (rare)
    if (snapshot.config.bounds.x !== this.#worldBounds.x || snapshot.config.bounds.y !== this.#worldBounds.y) {
      this.setWorldBounds(snapshot.config.bounds)
    }

    this.#syncRocks(snapshot.config)
    this.#syncPlants(snapshot.plants)
    this.#syncFertilizers(snapshot.fertilizers ?? [])
    this.#syncCorpses(snapshot.corpses ?? [])
    this.#syncManures(snapshot.manures ?? [])
    this.#syncAgents(snapshot.agents)
    if (!this.#autoCentered || this.#countVisibleAgents(snapshot) === 0) {
      this.#focusOnSnapshot(snapshot)
      this.#autoCentered = true
      this.#syncAgents(snapshot.agents) // re-run with new camera position
    }
    this.#lastSnapshot = snapshot
    if (this.#pendingHighlight !== null && this.#agentSprites.has(this.#pendingHighlight)) {
      this.#flashAgent(this.#pendingHighlight)
      this.#pendingHighlight = null
    }
    
    if (this.#miniMapOverlay.visible) {
      this.#renderDebugOverlay()
    }

    this.#applyPendingFocus()
  }

  #syncRocks(config: WorldConfig) {
    const key = `${config.rngSeed}:${config.bounds.x}:${config.bounds.y}`
    if (this.#rockKey === key) return
    this.#rockKey = key

    // Clear previous rocks
    this.#rockSprites.forEach((graphic) => {
      graphic.removeFromParent()
      graphic.destroy()
    })
    this.#rockSprites.clear()

    const rocks = generateRocks(config)
    rocks.forEach((rock) => {
      const g = new Graphics()
      drawPolygon(g, rock.outline)
      const fill = rock.radius < 20 ? 0x475569 : rock.radius < 70 ? 0x334155 : 0x1f2937
      g.fill({ color: fill, alpha: 0.95 })
      g.stroke({ color: 0x0f172a, alpha: 0.9, width: Math.max(1, Math.round(rock.radius * 0.1)) })
      g.position.set(rock.position.x, rock.position.y)
      g.zIndex = 5
      g.eventMode = 'none'
      this.#entityLayer.addChild(g)
      this.#rockSprites.set(rock.id, g)
    })
  }

  setWorldBounds(bounds: Vector2) {
    this.#worldBounds = { x: bounds.x, y: bounds.y }
    this.#buildGrid()
    this.#refreshZoomLimits()
    this.#updateCamera()
  }

  // --- Optimization: Robust Texture Generation ---
  #createTextures() {
    if (!this.#renderer) return

    // Helper to safely render a graphic to a texture in v8
	    const bake = (graphics: Graphics): Texture => {
	      const bounds = graphics.getLocalBounds()
	      // Pad slightly to avoid anti-aliasing clipping
	      const width = Math.ceil(bounds.width) + 4
	      const height = Math.ceil(bounds.height) + 4
	      
	      const texture = RenderTexture.create({ width, height, resolution: this.#renderer!.resolution })
	      const container = new Container()
	      container.addChild(graphics)
      
      // Center the graphics in the texture
      // If graphics were drawn at -24, -24, this shifts them to +2, +2 inside the texture
      graphics.position.set(-bounds.x + 2, -bounds.y + 2)

      this.#renderer!.render({
        container,
        target: texture,
        clear: true,
      })

      // Clean up wrapper but keep texture
      container.destroy({ children: true }) 
      return texture
    }

    const config = CREATURE_DESIGN_DEFAULT
    const hunterParts = this.#buildAgentGraphics('hunter', config)
    const preyParts = this.#buildAgentGraphics('prey', config)
    this.#agentDims = { hunter: hunterParts.dims, prey: preyParts.dims }

    this.#agentTextures = {
      hunter: {
        base: bake(hunterParts.base),
        accent: bake(hunterParts.accent),
        glow: bake(hunterParts.glow),
        overlay: bake(hunterParts.overlay),
      },
      prey: {
        base: bake(preyParts.base),
        accent: bake(preyParts.accent),
        glow: bake(preyParts.glow),
        overlay: bake(preyParts.overlay),
      },
    }
    const hunterPalette = buildPalette(config, 'hunter')
    const preyPalette = buildPalette(config, 'prey')
    this.#accentTints = {
      hunter: hunterPalette.accent,
      prey: preyPalette.accent,
    }
    this.#glowTints = {
      hunter: hunterPalette.glow,
      prey: preyPalette.glow,
    }

    this.#plantTextures = [
      bake(this.#buildPlantGraphics(0)),
      bake(this.#buildPlantGraphics(1)),
      bake(this.#buildPlantGraphics(2)),
    ]

    const corpseGraphic = new Graphics()
      .ellipse(0, 0, 22, 16)
      .fill(0xffffff)
      .ellipse(-10, -4, 10, 8)
      .fill(0xffffff)
      .ellipse(12, 6, 9, 7)
      .fill(0xffffff)
    this.#corpseTexture = bake(corpseGraphic)

    this.#legTexture = bake(this.#buildLegOverlayGraphic())
    this.#finTexture = bake(this.#buildFinOverlayGraphic())
    this.#wingTexture = bake(this.#buildWingOverlayGraphic())

    this.#buildGrid()
  }

	  #buildAgentGraphics(archetype: 'hunter' | 'prey', config = CREATURE_DESIGN_DEFAULT) {
	    const base = new Graphics()
	    const accent = new Graphics()
	    const glow = new Graphics()
	    const overlay = new Graphics()
	    const profile = VARIANT_PROFILE[archetype]
	    const dims = this.#scaleDimensions(computeDimensions(config, profile))
	    const start = -dims.length / 2

    // Torso silhouette (base texture, tinted via family color)
    base.roundRect(start, -dims.thickness / 2, dims.length, dims.thickness, dims.thickness * 0.45).fill(0xffffff)
    base
      .roundRect(-dims.length * 0.35, -dims.thickness * 0.2, dims.length * 0.55, dims.thickness * 0.4, dims.thickness * 0.25)
      .fill(0xe5e7eb)

    // Head block (attached to torso)
    const headWidth = dims.headSize * (archetype === 'hunter' ? 0.95 : 0.85)
    const headHeight = dims.headSize * 0.65
    const headX = dims.headAnchor - headWidth / 2
    base.roundRect(headX, -headHeight / 2, headWidth, headHeight, headHeight * 0.65).fill(0xffffff)
	    base
	      .roundRect(headX + headWidth * 0.35, -headHeight / 2, headWidth * 0.45, headHeight * 0.55, headHeight * 0.35)
	      .fill(0xf4f4f5)

	    // Accent/glow decals intentionally omitted (cosmetic lines/arcs removed).
	    void accent
	    void glow

	    // Behaviour overlay (tinted per agent mode)
	    overlay
	      .roundRect(start, -dims.thickness / 2, dims.length, dims.thickness, dims.thickness * 0.45)
	      .fill({ color: 0xffffff, alpha: 0.28 })

	    return { base, accent, glow, overlay, dims }
	  }

  #drawOverlayPattern(overlay: Graphics, dims: CreatureDimensions, patternStyle: CreaturePatternStyle) {
    // Intentionally blank: legacy patterning (e.g. zig-zags) removed in favor of organ-driven visuals.
    void overlay
    void dims
    void patternStyle
  }

  #scaleDimensions(dims: CreatureDimensions): CreatureDimensions {
    return {
      length: dims.length * CREATURE_TEXTURE_SCALE,
      thickness: dims.thickness * CREATURE_TEXTURE_SCALE,
      headSize: dims.headSize * CREATURE_TEXTURE_SCALE,
      crestHeight: dims.crestHeight * CREATURE_TEXTURE_SCALE,
      tailLength: dims.tailLength * CREATURE_TEXTURE_SCALE,
      platingSegments: dims.platingSegments,
      headAnchor: dims.headAnchor * CREATURE_TEXTURE_SCALE,
    }
  }

  #buildPlantGraphics(seed: number) {
    const g = new Graphics()
    const height = 40 + seed * 8
    g.moveTo(0, -height)
      .bezierCurveTo(8 + seed * 4, -height * 0.4, -6, -height * 0.1, 0, height * 0.8)
      .lineTo(-4, height * 0.8)
      .bezierCurveTo(-10 - seed * 3, -height * 0.2, 10, -height * 0.7, 0, -height)
      .fill(0xffffff)
    return g
  }

  #buildLegOverlayGraphic() {
    const g = new Graphics()
    g.moveTo(0, 0).lineTo(0, 18).stroke({ width: 3, color: 0xffffff, alpha: 0.85 })
    return g
  }

  #buildFinOverlayGraphic() {
    const g = new Graphics()
    g.moveTo(0, 0).lineTo(12, -16).lineTo(18, 0).closePath().fill({ color: 0xffffff, alpha: 0.55 })
    return g
  }

  #buildWingOverlayGraphic() {
    const g = new Graphics()
    g.moveTo(0, 0).quadraticCurveTo(-16, -20, -32, -6).quadraticCurveTo(-16, -16, 0, 0)
    g.moveTo(0, 0).quadraticCurveTo(16, -20, 32, -6).quadraticCurveTo(16, -16, 0, 0)
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.8 })
    return g
  }

  // --- Optimization: Culling & Pooling ---

  #syncAgents(agents: AgentState[]) {
    if (!this.#agentTextures) return

    // 1. Mark all current sprites as inactive (don't destroy yet)
    for (const entry of this.#agentSprites.values()) {
      entry.active = false
    }

    // 2. Calculate Camera Bounds for Culling
    // We add padding to ensure agents don't pop out at edges
    const viewPadding = 100
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app!.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app!.screen.height) / this.#cameraScale + viewPadding

    const baseSize = 48

    // 3. Update or Create Agents
    for (const agent of agents) {
      const archetype = agent.dna.archetype === 'hunter' ? 'hunter' : 'prey'
      const isScavenger = agent.dna.archetype === 'scavenger'
      let entry = this.#agentSprites.get(agent.id)

      // Create new (or get from pool)
      if (!entry) {
        if (this.#agentPool.length > 0) {
          entry = this.#agentPool.pop()!
          entry.container.visible = true
          this.#configureAgentSprite(entry, archetype)
        } else {
          entry = this.#createAgentSprite(archetype)
        }
        this.#agentSprites.set(agent.id, entry)
        entry.container.zIndex = 10
        this.#entityLayer.addChild(entry.container)
      } else if (entry.archetype !== archetype) {
        this.#configureAgentSprite(entry, archetype)
      }

      entry.active = true

      // Culling Check: If outside camera, skip updating transforms and hide
      if (agent.position.x < minX || agent.position.x > maxX || 
          agent.position.y < minY || agent.position.y > maxY) {
        entry.container.visible = false
        continue
      }

      entry.container.visible = true

      // Update Visuals
      const mass = agent.mass ?? agent.dna.bodyMass
      const fatCapacity = effectiveFatCapacity(agent.dna, mass)
      const weightScale = 1 + (agent.fatStore / Math.max(fatCapacity, 1)) * 0.7
      const size = (6 + mass * 3) * weightScale * 2
      const scale = size / baseSize

      entry.container.position.set(agent.position.x, agent.position.y)
      entry.container.scale.set(scale)
      entry.container.rotation = agent.heading
      const speed = Math.sqrt(agent.velocity.x * agent.velocity.x + agent.velocity.y * agent.velocity.y)
      entry.moveIntensity = clamp(speed / Math.max(agent.dna.baseSpeed || 1, 1), 0, 1)
      if (typeof agent.gaitPhase === 'number' && Number.isFinite(agent.gaitPhase)) {
        entry.gaitPhase = agent.gaitPhase
        entry.gaitPhaseFromSim = true
      } else {
        entry.gaitPhaseFromSim = false
      }

      const fleeing = agent.mode === 'flee' && this.#debugMoodOverlay
      if (fleeing) {
        entry.base.tint = PINK_MASK
        entry.accent.tint = PINK_MASK
        entry.glow.tint = PINK_MASK
        entry.overlay.tint = PINK_MASK
      } else if (isScavenger) {
        // Scavengers are brown (dead-meat eaters).
        const base = parseColor(agent.dna.familyColor)
        entry.base.tint = base
        entry.accent.tint = lightenColor(base, 0.2)
        entry.glow.tint = lightenColor(base, 0.35)
        entry.overlay.tint = this.#modeColor(agent)
      } else {
        entry.base.tint = parseColor(agent.dna.familyColor)
        entry.accent.tint = this.#accentTints[archetype]
        entry.glow.tint = this.#glowTints[archetype]
        entry.overlay.tint = this.#modeColor(agent)
      }
      this.#updateLimbOverlay(entry, agent)
      this.#updateFinOverlay(entry, agent)
      this.#updateWingOverlay(entry, agent)
    }

    // 4. Cleanup: Return inactive sprites to pool
    // Using explicit iteration to avoid creating new arrays/Sets every frame
    const idsToDelete: number[] = []
    for (const [id, entry] of this.#agentSprites) {
      if (!entry.active) {
        entry.container.visible = false
        this.#agentPool.push(entry) // Return to pool
        idsToDelete.push(id)
      }
    }
    for (const id of idsToDelete) {
      this.#agentSprites.delete(id)
    }
  }

  #createAgentSprite(archetype: 'hunter' | 'prey'): AgentSpriteData {
    const container = new Container()
    const base = new Sprite()
    const accent = new Sprite()
    const glow = new Sprite()
    const overlay = new Sprite()
    const organs = new Graphics()
    const limbs = new Graphics()
    const fins = new Graphics()
    const wings = new Graphics()

    base.anchor.set(0.5)
    accent.anchor.set(0.5)
    glow.anchor.set(0.5)
    overlay.anchor.set(0.5)
    overlay.alpha = 0.65
    glow.alpha = 0.45
    accent.alpha = 0.95

    container.addChild(glow, limbs, fins, wings, base, accent, organs, overlay)

    const entry: AgentSpriteData = {
      container,
      base,
      accent,
      glow,
      overlay,
      organs,
      limbs,
      fins,
      wings,
      archetype,
      pulsePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 0.8,
      gaitPhase: Math.random() * Math.PI * 2,
      gaitPhaseFromSim: false,
      turnIntensity: 0,
      bodyOffsetX: 0,
      bodyOffsetY: 0,
      moveIntensity: 0,
      landVisuals: null,
      eyePlacements: [],
      earPlacements: [],
      nosePlacements: [],
      active: true,
    }
    this.#configureAgentSprite(entry, archetype)
    return entry
  }

  #configureAgentSprite(entry: AgentSpriteData, archetype: 'hunter' | 'prey') {
    if (!this.#agentTextures) return
    const textures = this.#agentTextures[archetype]
    entry.base.texture = textures.base
    entry.accent.texture = textures.accent
    entry.glow.texture = textures.glow
    entry.overlay.texture = textures.overlay
    entry.accent.tint = this.#accentTints[archetype]
    entry.glow.tint = this.#glowTints[archetype]
    entry.archetype = archetype
    entry.landVisuals = null
    entry.eyePlacements = []
    entry.earPlacements = []
    entry.nosePlacements = []
    entry.moveIntensity = 0
    entry.gaitPhaseFromSim = false
    entry.lastHeading = undefined
    entry.turnIntensity = 0
    entry.bodyOffsetX = 0
    entry.bodyOffsetY = 0
    entry.organs.clear()
    entry.organs.visible = !this.#lightweightVisuals
    entry.limbs.clear()
    entry.limbs.visible = !this.#lightweightVisuals
    entry.fins.clear()
    entry.fins.visible = !this.#lightweightVisuals
    entry.wings.clear()
    entry.wings.visible = !this.#lightweightVisuals
  }

  #syncPlants(plants: PlantState[]) {
    if (!this.#plantTextures.length) return

    // Mark inactive
    for (const entry of this.#plantSprites.values()) {
      entry.active = false
    }

    // Culling bounds (same as agents)
    const viewPadding = 100
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app!.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app!.screen.height) / this.#cameraScale + viewPadding

    for (const plant of plants) {
      let entry = this.#plantSprites.get(plant.id)

      if (!entry) {
        if (this.#plantPool.length > 0) {
          entry = this.#plantPool.pop()!
          entry.sprite.visible = true
        } else {
          const sprite = new Sprite(this.#randomPlantTexture())
          sprite.anchor.set(0.5, 1)
          sprite.alpha = 0.8
          sprite.eventMode = 'none'
          sprite.zIndex = 0
          this.#entityLayer.addChild(sprite)
          entry = {
            sprite,
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 0.5 + Math.random() * 0.8,
            active: true
          }
        }
        this.#plantSprites.set(plant.id, entry)
      }

      entry.active = true

      // Culling
      if (plant.position.x < minX || plant.position.x > maxX || 
          plant.position.y < minY || plant.position.y > maxY) {
        entry.sprite.visible = false
        continue
      }

      entry.sprite.visible = true
      entry.sprite.position.set(plant.position.x, plant.position.y)
      entry.sprite.tint = parseColor(plant.dna.pigment)
      const baseScale = 0.5 + plant.size * 0.4
      entry.sprite.scale.set(baseScale * 4)
    }

    // Return to pool
    const idsToDelete: number[] = []
    for (const [id, entry] of this.#plantSprites) {
      if (!entry.active) {
        entry.sprite.visible = false
        this.#plantPool.push(entry)
        idsToDelete.push(id)
      }
    }
    for (const id of idsToDelete) {
      this.#plantSprites.delete(id)
    }
  }

  #syncCorpses(corpses: CorpseState[]) {
    if (!this.#corpseTexture) return

    for (const entry of this.#corpseSprites.values()) {
      entry.active = false
    }

    const viewPadding = 80
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app!.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app!.screen.height) / this.#cameraScale + viewPadding

    const baseRadius = 22
    for (const corpse of corpses) {
      let entry = this.#corpseSprites.get(corpse.id)
      if (!entry) {
        if (this.#corpsePool.length > 0) {
          entry = this.#corpsePool.pop()!
          entry.sprite.visible = true
        } else {
          const sprite = new Sprite(this.#corpseTexture)
          sprite.anchor.set(0.5)
          sprite.eventMode = 'none'
          sprite.zIndex = 6
          this.#entityLayer.addChild(sprite)
          entry = { sprite, active: true }
        }
        this.#corpseSprites.set(corpse.id, entry)
      }

      entry.active = true

      if (
        corpse.position.x < minX ||
        corpse.position.x > maxX ||
        corpse.position.y < minY ||
        corpse.position.y > maxY
      ) {
        entry.sprite.visible = false
        continue
      }

      entry.sprite.visible = true
      entry.sprite.position.set(corpse.position.x, corpse.position.y)
      const decayRatio = corpse.maxDecay > 0 ? corpse.decay / corpse.maxDecay : 0
      entry.sprite.alpha = clamp(0.18 + clamp(decayRatio, 0, 1) * 0.7, 0.12, 0.92)
      entry.sprite.tint = 0x8b5a2b
      const r = Math.max(6, corpse.radius || 14)
      entry.sprite.scale.set(r / baseRadius)
    }

    const idsToDelete: number[] = []
    for (const [id, entry] of this.#corpseSprites) {
      if (!entry.active) {
        entry.sprite.visible = false
        this.#corpsePool.push(entry)
        idsToDelete.push(id)
      }
    }
    for (const id of idsToDelete) {
      this.#corpseSprites.delete(id)
    }
  }

  #syncManures(manures: ManureState[]) {
    if (!this.#corpseTexture) return

    for (const entry of this.#manureSprites.values()) {
      entry.active = false
    }

    const viewPadding = 80
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app!.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app!.screen.height) / this.#cameraScale + viewPadding

    const baseRadius = 22
    for (const manure of manures) {
      let entry = this.#manureSprites.get(manure.id)
      if (!entry) {
        if (this.#manurePool.length > 0) {
          entry = this.#manurePool.pop()!
          entry.sprite.visible = true
        } else {
          const sprite = new Sprite(this.#corpseTexture)
          sprite.anchor.set(0.5)
          sprite.eventMode = 'none'
          sprite.zIndex = 6
          this.#entityLayer.addChild(sprite)
          entry = { sprite, active: true }
        }
        this.#manureSprites.set(manure.id, entry)
      }

      entry.active = true

      if (
        manure.position.x < minX ||
        manure.position.x > maxX ||
        manure.position.y < minY ||
        manure.position.y > maxY
      ) {
        entry.sprite.visible = false
        continue
      }

      entry.sprite.visible = true
      entry.sprite.position.set(manure.position.x, manure.position.y)
      const decayRatio = manure.maxDecay > 0 ? manure.decay / manure.maxDecay : 0
      entry.sprite.alpha = clamp(0.2 + clamp(decayRatio, 0, 1) * 0.75, 0.12, 0.95)
      entry.sprite.tint = 0x6b3f1f
      const r = Math.max(3, manure.radius || 6)
      entry.sprite.scale.set(r / baseRadius)
    }

    const idsToDelete: number[] = []
    for (const [id, entry] of this.#manureSprites) {
      if (!entry.active) {
        entry.sprite.visible = false
        this.#manurePool.push(entry)
        idsToDelete.push(id)
      }
    }
    for (const id of idsToDelete) {
      this.#manureSprites.delete(id)
    }
  }

  #syncFertilizers(fertilizers: FertilizerState[]) {
    if (!this.#corpseTexture) return

    for (const entry of this.#fertilizerSprites.values()) {
      entry.active = false
    }

    const viewPadding = 120
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app!.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app!.screen.height) / this.#cameraScale + viewPadding

    const baseRadius = 22
    for (const fertilizer of fertilizers) {
      let entry = this.#fertilizerSprites.get(fertilizer.id)
      if (!entry) {
        if (this.#fertilizerPool.length > 0) {
          entry = this.#fertilizerPool.pop()!
          entry.sprite.visible = true
        } else {
          const sprite = new Sprite(this.#corpseTexture)
          sprite.anchor.set(0.5)
          sprite.eventMode = 'none'
          // Under plants/corpses; looks like a soil patch.
          sprite.zIndex = -1
          this.#entityLayer.addChild(sprite)
          entry = { sprite, active: true }
        }
        this.#fertilizerSprites.set(fertilizer.id, entry)
      }

      entry.active = true

      if (
        fertilizer.position.x < minX ||
        fertilizer.position.x > maxX ||
        fertilizer.position.y < minY ||
        fertilizer.position.y > maxY
      ) {
        entry.sprite.visible = false
        continue
      }

      entry.sprite.visible = true
      entry.sprite.position.set(fertilizer.position.x, fertilizer.position.y)
      entry.sprite.tint = 0xc9b08a
      const r = Math.max(6, fertilizer.radius || 20)
      entry.sprite.scale.set(r / baseRadius)
      // Alpha scales with remaining nutrients so depleted patches fade.
      const richness = clamp(Math.sqrt(Math.max(0, fertilizer.nutrients || 0)) / 220, 0, 1)
      entry.sprite.alpha = clamp(0.08 + richness * 0.35, 0.06, 0.45)
    }

    const idsToDelete: number[] = []
    for (const [id, entry] of this.#fertilizerSprites) {
      if (!entry.active) {
        entry.sprite.visible = false
        this.#fertilizerPool.push(entry)
        idsToDelete.push(id)
      }
    }
    for (const id of idsToDelete) {
      this.#fertilizerSprites.delete(id)
    }
  }

  // ... rest of helper methods ...

  fitToScreen() {
    if (!this.#isReady) {
      this.#pendingFit = true
      return
    }
    if (!this.#renderer || !this.#host) return
    const { clientWidth, clientHeight } = this.#host
    const width = Math.max(1, clientWidth)
    const height = Math.max(1, clientHeight)
    const safeWorldWidth = Math.max(1, this.#worldBounds.x)
    const safeWorldHeight = Math.max(1, this.#worldBounds.y)
    
    const scaleX = width / safeWorldWidth
    const scaleY = height / safeWorldHeight
    const rawScale = Math.min(scaleX, scaleY)

    this.#refreshZoomLimits()
    this.#cameraScale = clamp(rawScale, this.#minZoom, this.#maxZoom)
    this.#updateCamera()
  }

  zoomIn() { this.#zoomCentered(1.25) }
  zoomOut() { this.#zoomCentered(0.8) }
  
  setGridVisible(visible: boolean) {
    this.#gridVisible = visible
    if (!this.#isReady) return
    this.#gridLayer.visible = visible
    if (visible) this.#buildGrid()
  }

  setDebugOverlay(enabled: boolean) {
    // Legacy master toggle: enable both mood and organ debug.
    this.setDebugMoodOverlay(enabled)
    this.setDebugOrganOverlay(enabled)
  }

  setDebugMoodOverlay(enabled: boolean) {
    this.#debugMoodOverlay = enabled
  }

  setDebugOrganOverlay(enabled: boolean) {
    this.#debugOrganOverlay = enabled
    this.#miniMapOverlay.visible = enabled
    if (this.#lastSnapshot) this.#renderDebugOverlay()
  }

  setLightweightVisuals(enabled: boolean) {
    this.#lightweightVisuals = enabled
    // Hide existing overlays immediately
    this.#agentSprites.forEach((entry) => {
      entry.limbs.visible = !enabled
      entry.fins.visible = !enabled
      entry.wings.visible = !enabled
    })
  }

  // ... Interactions & Camera Logic (Standard) ...
  
  #animate(dt: number) {
    // Only animate what is visible
    // PixiJS's visible check is fast, but we can skip logic too
    
    for (const entry of this.#agentSprites.values()) {
      if (!entry.container.visible) continue; // Skip off-screen logic

      const moving = entry.moveIntensity > 0.04
      const heading = entry.container.rotation
      const last = entry.lastHeading
      const deltaHeading = last === undefined ? 0 : angleDiff(heading, last) / Math.max(dt, 0.001)
      entry.lastHeading = heading
      entry.turnIntensity = clamp(Math.abs(deltaHeading) / 0.65, 0, 1)
      const locomotionIntensity = clamp(Math.max(entry.moveIntensity, entry.turnIntensity * 0.75), 0, 1)

      entry.pulsePhase += entry.wobbleSpeed * dt * (moving ? 0.02 : 0.045)
      const pulse = 1 + Math.sin(entry.pulsePhase) * (moving ? 0.01 : 0.03)
      entry.base.scale.set(pulse)
      entry.accent.scale.set(pulse)

      // If the sim provides gaitPhase, render directly from it; otherwise locally advance for preview.
      if (!entry.gaitPhaseFromSim) {
        entry.gaitPhase += dt * (0.04 + locomotionIntensity * 0.25)
      }
      if (entry.landVisuals && entry.limbs.visible) this.#renderLandLimbs(entry)

      // Subtle body bob/shift relative to legs to sell planted steps and turning.
      if (entry.landVisuals) {
        const { dims, gaitStyle } = entry.landVisuals
        const bob = Math.sin(entry.gaitPhase) * dims.length * 0.012 * locomotionIntensity * (0.7 + (1 - gaitStyle) * 0.35)
        const sway =
          Math.cos(entry.gaitPhase * 2) * dims.thickness * 0.006 * entry.turnIntensity * (0.6 + gaitStyle * 0.4)
        entry.bodyOffsetX = bob
        entry.bodyOffsetY = sway
      } else {
        entry.bodyOffsetX = 0
        entry.bodyOffsetY = 0
      }
      entry.base.position.set(entry.bodyOffsetX, entry.bodyOffsetY)
      entry.accent.position.set(entry.bodyOffsetX, entry.bodyOffsetY)
      entry.glow.position.set(entry.bodyOffsetX, entry.bodyOffsetY)
      entry.overlay.position.set(entry.bodyOffsetX, entry.bodyOffsetY)
      entry.organs.position.set(entry.bodyOffsetX, entry.bodyOffsetY)

      entry.glow.alpha = 0.3 + (Math.sin(entry.pulsePhase * 1.1) + 1) * 0.22
      entry.overlay.alpha = moving ? 0.45 : 0.55
    }

    for (const entry of this.#plantSprites.values()) {
      if (!entry.active || !entry.sprite.visible) continue
      entry.swayPhase += dt * 0.03 * (0.6 + entry.swaySpeed)
      const sway = Math.sin(entry.swayPhase) * 0.06
      entry.sprite.rotation = sway
      entry.sprite.scale.y = 0.98 + Math.abs(Math.sin(entry.swayPhase * 0.7)) * 0.04
    }
  }

  #randomPlantTexture() {
    return this.#plantTextures[Math.floor(Math.random() * this.#plantTextures.length)]
  }

  #modeColor(agent: AgentState) {
    if (this.#debugMoodOverlay) {
      const fleeing = agent.mode === 'flee'
      if (fleeing) return DEBUG_FLEE_COLOR
      const kind = (agent.mood?.kind as MoodKind | undefined) ?? 'idle'
      return MOOD_COLORS[kind] ?? MODE_COLORS[agent.mode] ?? MODE_COLORS.sleep
    }
    return MODE_COLORS[agent.mode] ?? MODE_COLORS.sleep
  }

  #bindInteractions() {
    if (!this.#app) return
    const canvas = this.#app.canvas
    canvas.style.touchAction = 'none'
    canvas.addEventListener('wheel', this.#handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.#handlePointerDown, { passive: false })
    window.addEventListener('pointermove', this.#handlePointerMove)
    window.addEventListener('pointerup', this.#handlePointerUp)
    window.addEventListener('resize', () => this.fitToScreen())
  }

  #handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9
    const target = { x: event.offsetX, y: event.offsetY }
    this.#zoomAt(target, zoomFactor)
  }

  #handlePointerDown = (event: PointerEvent) => {
    event.preventDefault()
    this.#activePointerId = event.pointerId
    this.#app?.canvas.setPointerCapture(event.pointerId)
    this.#isPanning = true
    this.#lastPointer = { x: event.clientX, y: event.clientY }
  }

  #handlePointerMove = (event: PointerEvent) => {
    if (!this.#isPanning || !this.#lastPointer) return
    if (this.#activePointerId !== null && event.pointerId !== this.#activePointerId) return
    const dx = event.clientX - this.#lastPointer.x
    const dy = event.clientY - this.#lastPointer.y
    this.#camera.position.x += dx
    this.#camera.position.y += dy
    this.#lastPointer = { x: event.clientX, y: event.clientY }
    this.#clampCamera()
  }

  #handlePointerUp = () => {
    this.#isPanning = false
    if (this.#activePointerId !== null) {
      this.#app?.canvas.releasePointerCapture(this.#activePointerId)
    }
    this.#activePointerId = null
    this.#lastPointer = null
    this.#clampCamera()
  }

  #zoomCentered(factor: number) {
    if (!this.#host) return
    const center = { x: this.#host.clientWidth / 2, y: this.#host.clientHeight / 2 }
    this.#zoomAt(center, factor)
  }

  #zoomAt(screenPoint: { x: number; y: number }, factor: number) {
    const prevScale = this.#cameraScale
    const nextScale = clamp(prevScale * factor, this.#minZoom, this.#maxZoom)
    if (nextScale === prevScale) return

    const worldBefore = this.#screenToWorld(screenPoint, prevScale)
    this.#cameraScale = nextScale
    const worldAfter = this.#screenToWorld(screenPoint, nextScale)

    this.#camera.position.x += (worldAfter.x - worldBefore.x) * this.#cameraScale
    this.#camera.position.y += (worldAfter.y - worldBefore.y) * this.#cameraScale
    this.#updateCamera()
  }

  #screenToWorld(point: { x: number; y: number }, scale = this.#cameraScale) {
    const invScale = 1 / scale
    return {
      x: (point.x - this.#camera.position.x) * invScale,
      y: (point.y - this.#camera.position.y) * invScale,
    }
  }

  #updateLimbOverlay(entry: AgentSpriteData, agent: AgentState) {
    if (this.#lightweightVisuals) {
      entry.limbs.visible = false
      entry.limbs.clear()
      entry.organs.visible = false
      entry.organs.clear()
      entry.landVisuals = null
      entry.eyePlacements = []
      entry.earPlacements = []
      entry.nosePlacements = []
      return
    }
    if (!featureFlags.landBodyPlan) {
      entry.limbs.visible = false
      entry.limbs.clear()
      entry.organs.visible = false
      entry.organs.clear()
      entry.landVisuals = null
      entry.eyePlacements = []
      entry.earPlacements = []
      entry.nosePlacements = []
      return
    }
    if (agent.dna.biome !== 'land' || !agent.dna.bodyPlan) {
      entry.limbs.visible = false
      entry.limbs.clear()
      entry.organs.visible = false
      entry.organs.clear()
      entry.landVisuals = null
      entry.eyePlacements = []
      entry.earPlacements = []
      entry.nosePlacements = []
      return
    }

    const dims = this.#agentDims?.[entry.archetype]
    if (!dims) {
      entry.limbs.visible = false
      entry.limbs.clear()
      entry.organs.visible = false
      entry.organs.clear()
      entry.landVisuals = null
      entry.eyePlacements = []
      entry.earPlacements = []
      entry.nosePlacements = []
      return
    }

    const legs = agent.dna.bodyPlan.limbs.filter((limb) => limb.kind === 'leg')
    const legMounts = legs.flatMap((leg) => {
      const mounts = leg.layout?.mounts ?? []
      return mounts.slice(0, Math.max(0, Math.floor(leg.count))).map((mount) => ({
        x: mount.x,
        side: mount.side,
        size: leg.size,
        gaitStyle: leg.gaitStyle,
      }))
    })
    const legCount = legMounts.length
    const legSize =
      legCount > 0
        ? legs.reduce((sum, leg) => sum + leg.size * Math.max(0, leg.count), 0) / Math.max(1, legs.reduce((sum, leg) => sum + Math.max(0, leg.count), 0))
        : 0
    const gaitStyle =
      legCount > 0
        ? legs.reduce((sum, leg) => sum + leg.gaitStyle * Math.max(0, leg.count), 0) / Math.max(1, legs.reduce((sum, leg) => sum + Math.max(0, leg.count), 0))
        : 0.5

    const tail = agent.dna.bodyPlan.appendages.find((appendage) => appendage.kind === 'tail')
    const tailCount = tail && tail.kind === 'tail' ? Math.max(0, Math.floor((tail as any).count ?? 1)) : 0
    const tailSize = tail && tail.kind === 'tail' ? tail.size : 0
    const tailMounts =
      tail && tail.kind === 'tail' ? (tail.layout?.mounts ?? []).slice(0, tailCount) : []

    const eyes = agent.dna.bodyPlan.senses.filter((sense) => sense.sense === 'eye')
    const ears = agent.dna.bodyPlan.senses.filter((sense) => sense.sense === 'ear')
    const noses = agent.dna.bodyPlan.senses.filter((sense) => sense.sense === 'nose')
    entry.eyePlacements = eyes.flatMap((eye) =>
      (eye.layout?.placements ?? []).slice(0, Math.max(0, Math.floor(eye.count))),
    )
    entry.earPlacements = ears.flatMap((ear) =>
      (ear.layout?.placements ?? []).slice(0, Math.max(0, Math.floor(ear.count))),
    )
    entry.nosePlacements = noses.flatMap((nose) =>
      (nose.layout?.placements ?? []).slice(0, Math.max(0, Math.floor(nose.count))),
    )

    const limbColor = lightenColor(parseColor(agent.dna.familyColor), 0.2)
    entry.landVisuals = {
      dims,
      legMounts,
      legSize,
      gaitStyle,
      tailMounts,
      tailSize,
      limbColor,
    }

    // Static organs (eyes, etc).
    this.#renderOrganOverlay(entry)

    // Animated limbs (legs/tail) are drawn in the ticker to match movement speed.
    entry.limbs.visible = !this.#lightweightVisuals
    if (entry.limbs.visible && entry.moveIntensity <= 0.01) {
      this.#renderLandLimbs(entry)
    }
  }

  #renderOrganOverlay(entry: AgentSpriteData) {
    if (this.#lightweightVisuals || !entry.landVisuals) {
      entry.organs.visible = false
      entry.organs.clear()
      return
    }
    const { dims } = entry.landVisuals
    const debug = this.#debugOrganOverlay
    entry.organs.visible =
      entry.eyePlacements.length > 0 || entry.earPlacements.length > 0 || entry.nosePlacements.length > 0
    entry.organs.clear()
    if (!entry.organs.visible) return

	    const eyeRadius = Math.max(1.4, dims.headSize * 0.12)
	    const pupilRadius = Math.max(0.8, eyeRadius * 0.45)
	    const earRadius = Math.max(1.4, eyeRadius * 0.95)
	    const noseRadius = Math.max(1.2, eyeRadius * 0.9)

    for (const eye of entry.eyePlacements) {
      const x = eye.x * dims.length
      const y = eye.y * dims.thickness
      entry.organs.circle(x, y, eyeRadius).fill({ color: 0xf8fafc, alpha: 0.95 })
      entry.organs.circle(x, y, pupilRadius).fill({ color: 0x0f172a, alpha: 0.9 })
      if (debug) {
        const dirLen = dims.length * 0.45
        entry.organs
          .moveTo(x, y)
          .lineTo(x + Math.cos(eye.angle) * dirLen, y + Math.sin(eye.angle) * dirLen)
          .stroke({ color: 0x0f172a, width: 1, alpha: 0.55 })
      }
    }

	    for (const ear of entry.earPlacements) {
	      const x = ear.x * dims.length
	      const y = ear.y * dims.thickness
	      const fillAlpha = debug ? 0.75 : 0.55
	      entry.organs.circle(x, y, earRadius).fill({ color: 0x38bdf8, alpha: fillAlpha })
	      entry.organs.circle(x, y, earRadius * 1.18).stroke({ color: 0x0f172a, width: 1, alpha: debug ? 0.45 : 0.28 })
	      entry.organs.circle(x, y, earRadius * 0.45).fill({ color: 0xf8fafc, alpha: debug ? 0.35 : 0.18 })
	    }
    for (const nose of entry.nosePlacements) {
      const x = nose.x * dims.length
      const y = nose.y * dims.thickness
      entry.organs.circle(x, y, noseRadius).fill({ color: 0xf97316, alpha: debug ? 0.72 : 0.3 })
      if (debug) {
        const dirLen = dims.length * 0.18
        entry.organs
          .moveTo(x, y)
          .lineTo(x + Math.cos(nose.angle) * dirLen, y + Math.sin(nose.angle) * dirLen)
          .stroke({ color: 0x7c2d12, width: 1, alpha: 0.5 })
      }
    }

    if (debug) {
      // Mount points (legs/tails) for quick validation.
      const { legMounts, tailMounts } = entry.landVisuals
      const mountRadius = Math.max(1.1, dims.thickness * 0.06)
      entry.organs.lineStyle(1, 0x0f172a, 0.35)
      for (const mount of legMounts) {
        const x = mount.x * dims.length
        const y = mount.side * dims.thickness * 0.34
        entry.organs.circle(x, y, mountRadius).stroke({ color: 0x0f172a, alpha: 0.45, width: 1 })
      }
      for (const mount of tailMounts) {
        const x = mount.x * dims.length
        const y = mount.y * dims.thickness
        entry.organs.circle(x, y, mountRadius).stroke({ color: 0x0f172a, alpha: 0.45, width: 1 })
      }
    }
  }

	  #renderLandLimbs(entry: AgentSpriteData) {
    if (this.#lightweightVisuals || !entry.landVisuals) {
      entry.limbs.visible = false
      entry.limbs.clear()
      return
    }
    const { dims, legMounts, legSize, gaitStyle, tailMounts, tailSize, limbColor } = entry.landVisuals
    entry.limbs.visible = true
    entry.limbs.clear()

    const speed = clamp(entry.moveIntensity, 0, 1)
    const turn = clamp(entry.turnIntensity, 0, 1)
    const locomotionIntensity = clamp(Math.max(speed, turn * 0.75), 0, 1)
    const phase = entry.gaitPhase
    const stride = dims.length * (0.03 + speed * (0.13 + gaitStyle * 0.06) + turn * 0.06)
    const baseLegReach = dims.thickness * (0.28 + legSize * 0.36)

    const baseWidth = Math.max(1.1, 1.1 + legSize * 1.7)
    entry.limbs.lineStyle(baseWidth, limbColor, 0.9)

    // Tail sway (better visible while moving).
    if (tailMounts.length > 0 && tailSize > 0) {
      const tailLen = dims.length * (0.22 + tailSize * 0.38)
      const swayAmp = (0.12 + locomotionIntensity * 0.55) * (0.6 + tailSize * 0.6)
      for (let i = 0; i < tailMounts.length; i++) {
        const mount = tailMounts[i]!
        const baseX = entry.bodyOffsetX + mount.x * dims.length
        const baseY = entry.bodyOffsetY + mount.y * dims.thickness
        const offset = i * 0.8
        const sway = Math.sin(phase * 0.9 + offset) * swayAmp
        const angle = (mount.angle ?? Math.PI) + sway
        const tipX = baseX + Math.cos(angle) * tailLen
        const tipY = baseY + Math.sin(angle) * tailLen
        const midX = (baseX + tipX) / 2 + Math.cos(angle + Math.PI / 2) * tailLen * 0.12
        const midY = (baseY + tipY) / 2 + Math.sin(angle + Math.PI / 2) * tailLen * 0.12
        entry.limbs.moveTo(baseX, baseY)
        entry.limbs.quadraticCurveTo(midX, midY, tipX, tipY)
      }
    }

    const tau = Math.PI * 2

    type GaitKind = 'biped' | 'walk' | 'trot' | 'pace' | 'bound' | 'gallop' | 'tripod' | 'wave'
    const legCount = legMounts.length
    let gaitKind: GaitKind = 'wave'
    if (legCount === 2) gaitKind = 'biped'
    else if (legCount === 4) {
      if (locomotionIntensity > 0.85 || gaitStyle > 0.9) gaitKind = 'bound'
      else if (locomotionIntensity > 0.72 || gaitStyle > 0.78) gaitKind = 'gallop'
      else if (gaitStyle > 0.55) gaitKind = 'trot'
      else if (gaitStyle > 0.38) gaitKind = 'pace'
      else gaitKind = 'walk'
    } else if (legCount === 6 && gaitStyle > 0.52) {
      gaitKind = 'tripod'
    } else if (legCount >= 7 && gaitStyle < 0.35) {
      gaitKind = 'wave'
    }

    const gaitDuty = (() => {
      switch (gaitKind) {
        case 'biped':
          return clamp(0.6 - locomotionIntensity * 0.18, 0.42, 0.7)
        case 'walk':
          return clamp(0.74 - locomotionIntensity * 0.22, 0.52, 0.8)
        case 'trot':
          return clamp(0.6 - locomotionIntensity * 0.18, 0.42, 0.66)
        case 'pace':
          return clamp(0.62 - locomotionIntensity * 0.18, 0.44, 0.68)
        case 'bound':
          return clamp(0.5 - locomotionIntensity * 0.16, 0.35, 0.58)
        case 'gallop':
          return clamp(0.46 - locomotionIntensity * 0.14, 0.32, 0.54)
        case 'tripod':
          return clamp(0.58 - locomotionIntensity * 0.16, 0.4, 0.65)
        case 'wave':
        default:
          return clamp(0.68 - locomotionIntensity * 0.2, 0.46, 0.76)
      }
    })()

    const frontX = stride * (0.6 + gaitStyle * 0.12)
    const backX = -stride * (0.44 + (1 - gaitStyle) * 0.06)
    const footRadius = Math.max(1.2, baseWidth * 0.75)
    const plantedAlpha = clamp(0.55 + locomotionIntensity * 0.35, 0.35, 0.95)
    const swingAlpha = clamp(0.22 + locomotionIntensity * 0.25, 0.18, 0.55)
    const footColor = lightenColor(limbColor, -0.1)

    const gaitOffset = (mount: (typeof legMounts)[number], index: number) => {
      if (gaitKind === 'biped') {
        return mount.side > 0 ? 0 : Math.PI
      }
      if (gaitKind === 'walk' && legCount === 4) {
        const front = mount.x > 0.08
        // 4-beat walk: LF -> RR -> RF -> LR
        const phaseIndex =
          front && mount.side < 0 ? 0 : !front && mount.side > 0 ? 1 : front && mount.side > 0 ? 2 : 3
        return (phaseIndex * tau) / 4
      }
      if (gaitKind === 'trot' && legCount === 4) {
        const front = mount.x > 0.08
        const diagonalA = (front && mount.side < 0) || (!front && mount.side > 0)
        return diagonalA ? 0 : Math.PI
      }
      if (gaitKind === 'pace' && legCount === 4) {
        return mount.side < 0 ? 0 : Math.PI
      }
      if ((gaitKind === 'bound' || gaitKind === 'gallop') && legCount >= 4) {
        const front = mount.x > 0.08
        const lead = mount.side > 0 ? 0 : 1
        const base = front ? 0 : Math.PI * 0.9
        return base + lead * Math.PI * 0.12 + mount.x * Math.PI * 0.22
      }
      if (gaitKind === 'tripod' && legCount === 6) {
        // Classify legs into front/mid/rear per side by sorting along x.
        const sameSide = legMounts
          .map((m, idx) => ({ m, idx }))
          .filter((item) => item.m.side === mount.side)
          .sort((a, b) => b.m.x - a.m.x)
        const posIndex = sameSide.findIndex((item) => item.idx === index)
        const group =
          mount.side < 0 ? (posIndex % 2 === 0 ? 0 : 1) : (posIndex % 2 === 1 ? 0 : 1)
        return group === 0 ? 0 : Math.PI
      }
      // Default: metachronal wave, ordered by x (front->rear) and alternating sides.
      const ordered = legMounts
        .map((m, idx) => ({ m, idx }))
        .sort((a, b) => {
          const dx = b.m.x - a.m.x
          if (Math.abs(dx) > 0.01) return dx
          return a.m.side - b.m.side
        })
      const rank = ordered.findIndex((item) => item.idx === index)
      return (rank * tau) / Math.max(1, legCount) + (mount.side > 0 ? 0 : Math.PI * 0.08)
    }

    const solveTwoSegmentLeg = (
      hipX: number,
      hipY: number,
      footX: number,
      footY: number,
      femur: number,
      tibia: number,
      kneeSign: number,
      extraBend: number,
    ) => {
      const dx = footX - hipX
      const dy = footY - hipY
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
      const maxReach = Math.max(0.001, (femur + tibia) * 0.98)
      const d = clamp(dist, 0.001, maxReach)
      const dirX = dx / dist
      const dirY = dy / dist
      const cosTheta = clamp((femur * femur + d * d - tibia * tibia) / (2 * femur * d), -1, 1)
      const proj = femur * cosTheta
      const h = femur * Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta)) * (1 + extraBend)
      const perpX = -dirY
      const perpY = dirX
      return {
        kneeX: hipX + dirX * proj + perpX * h * kneeSign,
        kneeY: hipY + dirY * proj + perpY * h * kneeSign,
      }
    }

    for (let i = 0; i < legMounts.length; i++) {
      const mount = legMounts[i]!
      const hipX = entry.bodyOffsetX + mount.x * dims.length
      const hipY = entry.bodyOffsetY + mount.side * dims.thickness * 0.34

      const offset = gaitOffset(mount, i)
      const p = wrapPhase(phase + offset)
      const stanceEnd = gaitDuty * tau
      const planted = p < stanceEnd && locomotionIntensity > 0.04
      const t = planted ? (stanceEnd <= 0.0001 ? 0 : p / stanceEnd) : ((p - stanceEnd) / Math.max(tau - stanceEnd, 0.0001))

      const localStride =
        stride *
        (0.85 +
          (mount.x > 0.12 ? 0.12 : mount.x < -0.12 ? -0.08 : 0) +
          clamp(mount.size, 0.1, 2) * 0.12)
      const footFrontX = localStride * (0.62 + mount.gaitStyle * 0.1)
      const footBackX = -localStride * (0.44 + (1 - mount.gaitStyle) * 0.06)

      const footX =
        planted
          ? hipX + footFrontX + (footBackX - footFrontX) * t
          : hipX + footBackX + (footFrontX - footBackX) * t

      const reach = baseLegReach * (0.92 + clamp(mount.size, 0.1, 2) * 0.28)
      const tuck = planted ? 1 : 0.66
      const footY = hipY + mount.side * reach * tuck + (planted ? 0 : Math.cos(p) * reach * 0.06 * mount.side)

      const swingLift = planted ? 0 : Math.sin(Math.PI * t)
      const femur = reach * (0.6 + clamp(mount.size, 0.1, 2) * 0.12)
      const tibia = reach * (0.55 + clamp(mount.size, 0.1, 2) * 0.18)
      const kneeSign = -mount.side
      const { kneeX, kneeY } = solveTwoSegmentLeg(
        hipX,
        hipY,
        footX,
        footY,
        femur,
        tibia,
        kneeSign,
        swingLift * (0.45 + mount.gaitStyle * 0.25),
      )

      const width = Math.max(0.9, baseWidth * (0.7 + clamp(mount.size, 0.1, 2) * 0.35))
      entry.limbs.lineStyle(width, limbColor, planted ? plantedAlpha : swingAlpha)
      entry.limbs.moveTo(hipX, hipY)
      entry.limbs.lineTo(kneeX, kneeY)
      entry.limbs.lineTo(footX, footY)

      if (planted) {
        entry.limbs.circle(footX, footY, footRadius).fill({ color: footColor, alpha: 0.7 })
        entry.limbs.circle(footX, footY, footRadius * 1.9).stroke({ color: footColor, width: 1, alpha: 0.12 })
      } else if (locomotionIntensity > 0.4) {
        entry.limbs.circle(footX, footY, footRadius * 0.75).fill({ color: footColor, alpha: 0.25 })
      }
    }
  }

  #updateFinOverlay(entry: AgentSpriteData, agent: AgentState) {
    if (this.#lightweightVisuals) {
      entry.fins.visible = false
      entry.fins.clear()
      return
    }
    if (!featureFlags.aquaticBodyPlan) {
      entry.fins.visible = false
      entry.fins.clear()
      return
    }
    if (agent.dna.biome !== 'water' || !agent.dna.bodyPlan) {
      entry.fins.visible = false
      entry.fins.clear()
      return
    }
    const fins = agent.dna.bodyPlan.appendages.filter((appendage) => appendage.kind === 'fin')
    if (!fins.length) {
      entry.fins.visible = false
      entry.fins.clear()
      return
    }
    entry.fins.visible = true
    entry.fins.clear()
    fins.forEach((fin) => {
      const color = lightenColor(parseColor(agent.dna.familyColor), 0.1 + fin.size * 0.1)
      const baseY = fin.placement === 'dorsal' ? -12 : fin.placement === 'ventral' ? 12 : 0
      const direction = fin.placement === 'tail' ? 1 : fin.placement === 'lateral' ? 0 : 0
      for (let i = 0; i < fin.count; i++) {
        const offset = fin.count > 1 ? -6 + (12 / Math.max(fin.count - 1, 1)) * i : 0
        const width = 10 + fin.size * 12
        const height = 14 + fin.size * 12
        entry.fins
          .moveTo(direction ? 20 : offset, baseY)
          .lineTo(offset, baseY - height)
          .lineTo(offset + width * (direction ? 1 : 0.4), baseY)
          .closePath()
          .fill({ color, alpha: 0.45 })
      }
    })
  }

  #updateWingOverlay(entry: AgentSpriteData, agent: AgentState) {
    if (this.#lightweightVisuals) {
      entry.wings.visible = false
      entry.wings.clear()
      return
    }
    if (!featureFlags.aerialBodyPlan) {
      entry.wings.visible = false
      entry.wings.clear()
      return
    }
    if (agent.dna.biome !== 'air' || !agent.dna.bodyPlan) {
      entry.wings.visible = false
      entry.wings.clear()
      return
    }
    const wings = agent.dna.bodyPlan.limbs.filter((limb) => limb.kind === 'wing')
    if (!wings.length) {
      entry.wings.visible = false
      entry.wings.clear()
      return
    }
    entry.wings.visible = true
    entry.wings.clear()
    const wing = wings[0]
    const color = lightenColor(parseColor(agent.dna.familyColor), 0.15)
    const span = 30 + wing.span * 40
    const sweep = 12 + wing.surface * 20
    entry.wings.lineStyle(1.5, color, 0.8)
    entry.wings.moveTo(0, -4)
    entry.wings.quadraticCurveTo(-span * 0.3, -sweep, -span / 2, -4)
    entry.wings.quadraticCurveTo(-span * 0.3, -sweep * 1.1, 0, -4)
    entry.wings.moveTo(0, -4)
    entry.wings.quadraticCurveTo(span * 0.3, -sweep, span / 2, -4)
    entry.wings.quadraticCurveTo(span * 0.3, -sweep * 1.1, 0, -4)
    entry.wings.endFill()
  }

  #updateCamera() {
    this.#camera.scale.set(this.#cameraScale)
    this.#clampCamera()
  }

  #refreshZoomLimits() {
    // Allow generous zoom-out; we'll center small worlds in the clamp logic instead of blocking zoom
    this.#minZoom = 0.04
    this.#maxZoom = Math.max(this.#baseMaxZoom, this.#minZoom)
    this.#cameraScale = clamp(this.#cameraScale, this.#minZoom, this.#maxZoom)
  }

  #applyPendingFocus() {
    if (!this.#lastSnapshot) return
    if (this.#pendingFocusAgent !== null) {
      const target = this.#pendingFocusAgent
      this.#pendingFocusAgent = null
      this.focusOnAgent(target)
    } else if (this.#pendingFocusFamily) {
      const color = this.#pendingFocusFamily
      this.#pendingFocusFamily = null
      this.focusOnFamily(color)
    }
  }

  #applyPendingUiActions() {
    this.setGridVisible(this.#gridVisible)
    if (this.#pendingFit) {
      this.#pendingFit = false
      this.fitToScreen()
    }
    this.#applyPendingFocus()
  }

  #countVisibleAgents(snapshot: SimulationSnapshot) {
    if (!this.#app) return 0
    const viewPadding = 100
    const minX = -this.#camera.position.x / this.#cameraScale - viewPadding
    const maxX = (-this.#camera.position.x + this.#app.screen.width) / this.#cameraScale + viewPadding
    const minY = -this.#camera.position.y / this.#cameraScale - viewPadding
    const maxY = (-this.#camera.position.y + this.#app.screen.height) / this.#cameraScale + viewPadding
    let count = 0
    for (const agent of snapshot.agents) {
      if (agent.position.x >= minX && agent.position.x <= maxX && agent.position.y >= minY && agent.position.y <= maxY) {
        count++
      }
    }
    return count
  }

  #focusOnSnapshot(snapshot: SimulationSnapshot) {
    if (!snapshot.agents.length) {
      this.#focusCamera(this.#worldBounds.x / 2, this.#worldBounds.y / 2)
      return
    }
    const center = snapshot.agents.reduce(
      (acc, agent) => {
        acc.x += agent.position.x
        acc.y += agent.position.y
        return acc
      },
      { x: 0, y: 0 },
    )
    center.x /= snapshot.agents.length
    center.y /= snapshot.agents.length
    this.#focusCamera(center.x, center.y)
  }

  #clampCamera() {
    if (!this.#host) return
    const width = this.#host.clientWidth
    const height = this.#host.clientHeight
    const worldWidth = this.#worldBounds.x * this.#cameraScale
    const worldHeight = this.#worldBounds.y * this.#cameraScale
    
    const buffer = 100 * this.#cameraScale

    if (worldWidth <= width) {
      // World narrower than viewport: center it, allow a tiny nudge
      const centerX = (width - worldWidth) / 2
      this.#camera.position.x = clamp(this.#camera.position.x, centerX - buffer * 0.25, centerX + buffer * 0.25)
    } else {
      // Allow panning slightly past edges
      const minX = width - worldWidth - buffer
      const maxX = buffer
      this.#camera.position.x = clamp(this.#camera.position.x, minX, maxX)
    }

    if (worldHeight <= height) {
      const centerY = (height - worldHeight) / 2
      this.#camera.position.y = clamp(this.#camera.position.y, centerY - buffer * 0.25, centerY + buffer * 0.25)
    } else {
      const minY = height - worldHeight - buffer
      const maxY = buffer
      this.#camera.position.y = clamp(this.#camera.position.y, minY, maxY)
    }
  }
  
  #renderDebugOverlay() {
    this.#miniMapOverlay.clear()
    if (!this.#lastSnapshot) return
    // ... (Keep debug logic same as provided, effectively just redrawing graphics)
    const overlay = this.#miniMapOverlay
    const cellSize = 64
    // Draw World Bounds
    overlay.rect(0, 0, this.#worldBounds.x, this.#worldBounds.y).stroke({ width: 2, color: 0x475569 })
    
    // Simple dots for minimap
    if (this.#lastSnapshot.agents.length < 1000) {
        this.#lastSnapshot.agents.forEach(a => {
             const moodColor = this.#modeColor(a)
             const tierColor = TIER_COLORS[(a.mood?.tier as MoodTier) ?? 'growth'] ?? 0x475569
             overlay.circle(a.position.x, a.position.y, 2).fill(moodColor).stroke({ width: 1, color: tierColor, alpha: 0.9 })
        })
    }
  }

  #buildGrid() {
    this.#gridLayer.clear()
    if (!this.#gridVisible) return
    
    const spacing = 200
    this.#gridLayer.alpha = 0.35
    
    // Draw simple grid
    for (let x = 0; x <= this.#worldBounds.x; x += spacing) {
      this.#gridLayer.moveTo(x, 0).lineTo(x, this.#worldBounds.y).stroke({ width: 1, color: 0x172033 })
    }
    for (let y = 0; y <= this.#worldBounds.y; y += spacing) {
      this.#gridLayer.moveTo(0, y).lineTo(this.#worldBounds.x, y).stroke({ width: 1, color: 0x172033 })
    }
  }
  
  focusOnFamily(color: string) {
    if (!color) return
    if (!this.#isReady || !this.#lastSnapshot) {
      this.#pendingFocusFamily = color
      return
    }
    if (!this.#lastSnapshot) return
    const members = this.#lastSnapshot.agents.filter((agent) => agent.dna.familyColor === color)
    if (!members.length) return
    const center = members.reduce(
      (acc, agent) => {
        acc.x += agent.position.x
        acc.y += agent.position.y
        return acc
      },
      { x: 0, y: 0 },
    )
    center.x /= members.length
    center.y /= members.length
    this.#focusCamera(center.x, center.y)
  }

  focusOnAgent(agentId: number) {
    if (!this.#isReady) {
      this.#pendingFocusAgent = agentId
      return
    }
    let target: { x: number; y: number } | null = null
    const sprite = this.#agentSprites.get(agentId)
    if (sprite) {
      target = { x: sprite.container.position.x, y: sprite.container.position.y }
      sprite.container.visible = true
    } else if (this.#lastSnapshot) {
      const found = this.#lastSnapshot.agents.find((agent) => agent.id === agentId)
      if (found) {
        target = { x: found.position.x, y: found.position.y }
        this.#pendingHighlight = agentId
      }
    }

    if (target) {
      this.#focusCamera(target.x, target.y)
      if (sprite) {
        this.#flashAgent(agentId)
      }
    }
  }

  #focusCamera(x: number, y: number) {
    if (!this.#host) return
    const width = this.#host.clientWidth || this.#worldBounds.x
    const height = this.#host.clientHeight || this.#worldBounds.y
    this.#camera.position.x = width / 2 - x * this.#cameraScale
    this.#camera.position.y = height / 2 - y * this.#cameraScale
    this.#clampCamera()
  }

  #flashAgent(agentId: number) {
    const entry = this.#agentSprites.get(agentId)
    if (!entry) return
    if (entry.highlightTimeout) {
      window.clearTimeout(entry.highlightTimeout)
    }
    const ring = new Graphics()
    ring.circle(0, 0, 28).stroke({ width: 3, color: 0xfbbf24, alpha: 0.85 })
    ring.alpha = 0.95
    entry.container.addChildAt(ring, 0)
    entry.highlightTimeout = window.setTimeout(() => {
      ring.destroy()
      entry.highlightTimeout = undefined
    }, 650)
  }
}

function drawPolygon(graphics: Graphics, points: Vector2[]) {
  if (points.length === 0) return
  graphics.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y)
  }
  graphics.closePath()
}

function parseColor(hex: string) {
  const cleaned = hex.replace('#', '')
  return Number.parseInt(cleaned, 16)
}

function lightenColor(color: number, amount: number) {
  const r = Math.min(255, ((color >> 16) & 0xff) + 255 * amount)
  const g = Math.min(255, ((color >> 8) & 0xff) + 255 * amount)
  const b = Math.min(255, (color & 0xff) + 255 * amount)
  return (r << 16) | (g << 8) | b
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function wrapPhase(phase: number) {
  const tau = Math.PI * 2
  if (!Number.isFinite(phase)) return 0
  return ((phase % tau) + tau) % tau
}

function angleDiff(a: number, b: number) {
  const d = a - b
  return Math.atan2(Math.sin(d), Math.cos(d))
}

export const pixiStage = new PixiStage()
