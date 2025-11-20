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
  MoodKind,
  MoodTier,
  PlantState,
  SimulationSnapshot,
  Vector2,
} from '@/types/sim'
import type { CreaturePatternStyle } from '@/types/creatureDesign'
import { CREATURE_DESIGN_DEFAULT } from '@/config/creatureDesignDefaults'
import { VARIANT_PROFILE, computeDimensions, buildPalette, type CreatureDimensions } from '@/render/creatureLook'
import { featureFlags } from '@/config/featureFlags'

type AgentSpriteData = {
  container: Container
  base: Sprite
  accent: Sprite
  glow: Sprite
  overlay: Sprite
  limbs: Graphics
  fins: Graphics
  wings: Graphics
  archetype: 'hunter' | 'prey'
  pulsePhase: number
  wobbleSpeed: number
  highlightTimeout?: number
  active: boolean // For pooling
}

type PlantSpriteData = {
  sprite: Sprite
  swayPhase: number
  swaySpeed: number
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

const CREATURE_TEXTURE_SCALE = 0.18

export class PixiStage {
  #app?: Application
  #renderer?: Renderer
  #host?: HTMLElement

  // layers
  #camera = new Container()
  #gridLayer = new Graphics()
  #miniMapOverlay = new Graphics()
  #plantLayer = new Container()
  #agentLayer = new Container()

  // Data & Pools
  #agentSprites = new Map<number, AgentSpriteData>()
  #agentPool: AgentSpriteData[] = []
  
  #plantSprites = new Map<number, PlantSpriteData>()
  #plantPool: PlantSpriteData[] = []

  #lastSnapshot: SimulationSnapshot | null = null
  #pendingHighlight: number | null = null
  #autoCentered = false
  #lightweightVisuals = false
  #debugMoodOverlay = false

  #agentTextures: Record<'hunter' | 'prey', { base: Texture; accent: Texture; glow: Texture; overlay: Texture }> | null =
    null
  #accentTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #glowTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #plantTextures: Texture[] = []
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
      background: '#050913',
      antialias: false, // Optimization: Disable MSAA for performance with many agents
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
    this.#camera.addChild(this.#gridLayer, this.#plantLayer, this.#agentLayer, this.#miniMapOverlay)
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

    this.#syncPlants(snapshot.plants)
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
      
      const texture = RenderTexture.create({ width, height })
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

    // Tail & torso silhouette (base texture, tinted via family color)
    base
      .moveTo(start, 0)
      .quadraticCurveTo(start - dims.tailLength * 0.2, -dims.thickness * 0.25, start - dims.tailLength, -2)
      .quadraticCurveTo(start - dims.tailLength * 0.25, dims.thickness * 0.35, start, dims.thickness * 0.18)
      .fill({ color: 0xfafafa, alpha: 0.95 })
    base
      .roundRect(-dims.length / 2, -dims.thickness / 2, dims.length, dims.thickness, dims.thickness * 0.45)
      .fill(0xffffff)
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

    // Accent plating + crest (tinted per archetype accent color)
    const crestLength = dims.length * 0.4
    accent
      .moveTo(-crestLength / 2, -dims.thickness / 2)
      .quadraticCurveTo(0, -dims.thickness / 2 - dims.crestHeight * 0.6, crestLength / 2, -dims.thickness / 2)
      .stroke({ color: 0xffffff, width: 2 })

    const segmentCount = Math.max(4, dims.platingSegments)
    const segmentWidth = dims.length / segmentCount
    for (let i = 0; i < segmentCount; i++) {
      const x = start + i * segmentWidth
      const arcHeight = dims.crestHeight * 0.2 * Math.sin((i / segmentCount) * Math.PI)
      accent
        .moveTo(x, dims.thickness / 2 - 0.5)
        .quadraticCurveTo(x + segmentWidth / 2, dims.thickness / 2 + arcHeight, x + segmentWidth, dims.thickness / 2 - 0.5)
        .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 })
    }

    accent
      .moveTo(start - dims.tailLength * 0.4, -dims.thickness * 0.15)
      .quadraticCurveTo(start - dims.tailLength * 0.15, -dims.thickness * 0.45, start + dims.tailLength * 0.1, -dims.thickness * 0.05)
      .stroke({ color: 0xffffff, width: 1.8 })

    // Glow decal (tinted using glow color)
    const glowRadius = Math.max(6, dims.headSize * (0.8 + config.lumens * 0.6))
    const glowX = dims.headAnchor + glowRadius * 0.15
    const glowY = -glowRadius * 0.2
    glow.circle(glowX, glowY, glowRadius).fill({ color: 0xffffff, alpha: 0.45 })
    glow.circle(glowX + glowRadius * 0.2, glowY - glowRadius * 0.1, glowRadius * 0.45).fill({ color: 0xffffff, alpha: 0.9 })

    // Behaviour overlay (tinted per agent mode)
    this.#drawOverlayPattern(overlay, dims, config.patternStyle)
    const eyeRadius = Math.max(2, dims.headSize * 0.18)
    overlay.circle(glowX + eyeRadius * 0.35, glowY - eyeRadius * 0.2, eyeRadius).fill({ color: 0xffffff, alpha: 0.95 })
    overlay.circle(glowX + eyeRadius * 0.8, glowY - eyeRadius * 0.5, eyeRadius * 0.35).fill({ color: 0xffffff, alpha: 0.85 })

    return { base, accent, glow, overlay }
  }

  #drawOverlayPattern(overlay: Graphics, dims: CreatureDimensions, patternStyle: CreaturePatternStyle) {
    if (patternStyle === 'dapples') {
      const dots = 4
      for (let i = 0; i < dots; i++) {
        const offsetX = -dims.length / 2 + (i + 1) * (dims.length / (dots + 1))
        const offsetY = (i % 2 === 0 ? -1 : 1) * dims.thickness * 0.25
        const radius = Math.max(1.5, dims.thickness * (0.15 + (i % 3) * 0.02))
        overlay.circle(offsetX, offsetY, radius).fill({ color: 0xffffff, alpha: 0.75 })
      }
      return
    }

    if (patternStyle === 'spines') {
      const segments = Math.max(3, Math.round(dims.length / 6))
      const top = -dims.thickness / 2
      for (let i = 0; i < segments; i++) {
        const progress = i / segments
        const x = -dims.length / 2 + progress * dims.length
        const height = dims.crestHeight * 0.4 * (1 - Math.abs(progress - 0.5))
        overlay
          .moveTo(x, top)
          .lineTo(x + 4, top - height)
          .lineTo(x + 8, top)
          .lineTo(x, top)
          .fill({ color: 0xffffff, alpha: 0.9 })
      }
      return
    }

    const spacing = dims.length / (4 + dims.length * 0.08)
    for (let x = -dims.length / 2 + spacing; x < dims.length / 2; x += spacing) {
      overlay
        .moveTo(x - spacing * 0.2, -dims.thickness / 2)
        .lineTo(x + spacing * 0.45, dims.thickness / 2)
        .stroke({ color: 0xffffff, width: 1.4, alpha: 0.85 })
    }
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
        this.#agentLayer.addChild(entry.container)
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
      const weightScale = 1 + (agent.fatStore / Math.max(agent.dna.fatCapacity, 1)) * 0.7
      const size = (6 + agent.dna.bodyMass * 3) * weightScale * 2
      const scale = size / baseSize

      entry.container.position.set(agent.position.x, agent.position.y)
      entry.container.scale.set(scale)
      entry.container.rotation = agent.heading

      const fleeing = agent.mode === 'flee' && this.#debugMoodOverlay
      if (fleeing) {
        entry.base.tint = PINK_MASK
        entry.accent.tint = PINK_MASK
        entry.glow.tint = PINK_MASK
        entry.overlay.tint = PINK_MASK
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

    container.addChild(glow, limbs, fins, wings, base, accent, overlay)

    const entry: AgentSpriteData = {
      container,
      base,
      accent,
      glow,
      overlay,
      limbs,
      fins,
      wings,
      archetype,
      pulsePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 0.8,
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
    const viewPadding = 50
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
          this.#plantLayer.addChild(sprite)
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
      entry.sprite.scale.set(baseScale)
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
    this.#miniMapOverlay.visible = enabled
    this.#debugMoodOverlay = enabled
    // Force a render update for the overlay immediately
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

      entry.pulsePhase += entry.wobbleSpeed * dt * 0.05
      const pulse = 1 + Math.sin(entry.pulsePhase) * 0.04
      entry.base.scale.set(pulse)
      entry.accent.scale.set(pulse)
      entry.glow.alpha = 0.35 + (Math.sin(entry.pulsePhase * 1.1) + 1) * 0.25
      entry.overlay.alpha = 0.45 + (Math.sin(entry.pulsePhase * 0.9) + 1) * 0.3
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
      return
    }
    if (!featureFlags.landBodyPlan) {
      entry.limbs.visible = false
      entry.limbs.clear()
      return
    }
    if (agent.dna.biome !== 'land' || !agent.dna.bodyPlan) {
      entry.limbs.visible = false
      entry.limbs.clear()
      return
    }

    const legs = agent.dna.bodyPlan.limbs.filter((limb) => limb.kind === 'leg')
    if (!legs.length) {
      entry.limbs.visible = false
      entry.limbs.clear()
      return
    }

    const color = lightenColor(parseColor(agent.dna.familyColor), 0.2)
    entry.limbs.visible = true
    entry.limbs.clear()
    entry.limbs.lineStyle(2, color, 0.8)

    const placementAnchor: Record<string, number> = {
      front: 0.3,
      mid: 0,
      rear: -0.3,
      mixed: 0.15,
    }

    legs.forEach((leg) => {
      const anchor = placementAnchor[leg.placement] ?? 0
      const groupSpan = leg.count > 1 ? 12 : 0
      for (let i = 0; i < leg.count; i++) {
        const offset =
          leg.count > 1 ? -groupSpan / 2 + (groupSpan / Math.max(leg.count - 1, 1)) * i : 0
        const x = anchor * 24 + offset
        const kneeY = 6 + leg.size * 8
        const footY = 20 + leg.size * 14
        const forward = anchor >= 0 ? 6 : -6
        entry.limbs.moveTo(x, 8)
        entry.limbs.lineTo(x + forward * 0.4, kneeY)
        entry.limbs.lineTo(x + forward, footY)
      }
    })
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

export const pixiStage = new PixiStage()
