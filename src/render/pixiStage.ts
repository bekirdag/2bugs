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

import type { AgentState, PlantState, SimulationSnapshot, Vector2 } from '@/types/sim'
import type { CreaturePatternStyle } from '@/types/creatureDesign'
import { CREATURE_DESIGN_DEFAULT } from '@/config/creatureDesignDefaults'
import { VARIANT_PROFILE, computeDimensions, buildPalette, type CreatureDimensions } from '@/render/creatureLook'

type AgentSpriteData = {
  container: Container
  base: Sprite
  accent: Sprite
  glow: Sprite
  overlay: Sprite
  archetype: 'hunter' | 'prey'
  pulsePhase: number
  wobbleSpeed: number
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

  #agentTextures: Record<'hunter' | 'prey', { base: Texture; accent: Texture; glow: Texture; overlay: Texture }> | null =
    null
  #accentTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #glowTints: Record<'hunter' | 'prey', number> = { hunter: 0xffffff, prey: 0xffffff }
  #plantTextures: Texture[] = []

  #worldBounds: Vector2 = { x: 1920, y: 1080 }
  #cameraScale = 1
  #minZoom = 0.35
  #maxZoom = 3
  #gridVisible = false

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
    this.#lastSnapshot = snapshot
    
    if (this.#miniMapOverlay.visible) {
      this.#renderDebugOverlay()
    }
  }

  setWorldBounds(bounds: Vector2) {
    this.#worldBounds = { x: bounds.x, y: bounds.y }
    this.#buildGrid()
  }

  // --- Optimization: Robust Texture Generation ---
  private #createTextures() {
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

    this.#buildGrid()
  }

  private #buildAgentGraphics(archetype: 'hunter' | 'prey', config = CREATURE_DESIGN_DEFAULT) {
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

  private #drawOverlayPattern(overlay: Graphics, dims: CreatureDimensions, patternStyle: CreaturePatternStyle) {
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

  private #scaleDimensions(dims: CreatureDimensions): CreatureDimensions {
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

  private #buildPlantGraphics(seed: number) {
    const g = new Graphics()
    const height = 40 + seed * 8
    g.moveTo(0, -height)
      .bezierCurveTo(8 + seed * 4, -height * 0.4, -6, -height * 0.1, 0, height * 0.8)
      .lineTo(-4, height * 0.8)
      .bezierCurveTo(-10 - seed * 3, -height * 0.2, 10, -height * 0.7, 0, -height)
      .fill(0xffffff)
    return g
  }

  // --- Optimization: Culling & Pooling ---

  private #syncAgents(agents: AgentState[]) {
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

      entry.base.tint = parseColor(agent.dna.familyColor)
      entry.accent.tint = this.#accentTints[archetype]
      entry.glow.tint = this.#glowTints[archetype]
      entry.overlay.tint = this.#modeColor(agent)
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

  private #createAgentSprite(archetype: 'hunter' | 'prey'): AgentSpriteData {
    const container = new Container()
    const base = new Sprite()
    const accent = new Sprite()
    const glow = new Sprite()
    const overlay = new Sprite()

    base.anchor.set(0.5)
    accent.anchor.set(0.5)
    glow.anchor.set(0.5)
    overlay.anchor.set(0.5)
    overlay.alpha = 0.65
    glow.alpha = 0.45
    accent.alpha = 0.95

    container.addChild(glow, base, accent, overlay)

    const entry: AgentSpriteData = {
      container,
      base,
      accent,
      glow,
      overlay,
      archetype,
      pulsePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 0.8,
      active: true,
    }
    this.#configureAgentSprite(entry, archetype)
    return entry
  }

  private #configureAgentSprite(entry: AgentSpriteData, archetype: 'hunter' | 'prey') {
    if (!this.#agentTextures) return
    const textures = this.#agentTextures[archetype]
    entry.base.texture = textures.base
    entry.accent.texture = textures.accent
    entry.glow.texture = textures.glow
    entry.overlay.texture = textures.overlay
    entry.accent.tint = this.#accentTints[archetype]
    entry.glow.tint = this.#glowTints[archetype]
    entry.archetype = archetype
  }

  private #syncPlants(plants: PlantState[]) {
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
          sprite.alpha = 0.85
          this.#plantLayer.addChild(sprite)
          entry = {
            sprite,
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 0.4 + Math.random() * 0.3,
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
    if (!this.#renderer || !this.#host) return
    const { clientWidth, clientHeight } = this.#host
    const width = Math.max(1, clientWidth)
    const height = Math.max(1, clientHeight)
    const safeWorldWidth = Math.max(1, this.#worldBounds.x)
    const safeWorldHeight = Math.max(1, this.#worldBounds.y)
    
    const scaleX = width / safeWorldWidth
    const scaleY = height / safeWorldHeight
    const rawScale = Math.min(scaleX, scaleY)
    
    this.#cameraScale = clamp(rawScale, this.#minZoom, this.#maxZoom)
    this.#updateCamera()
  }

  zoomIn() { this.#zoomCentered(1.25) }
  zoomOut() { this.#zoomCentered(0.8) }
  
  setGridVisible(visible: boolean) {
    this.#gridVisible = visible
    this.#gridLayer.visible = visible
    if (visible) this.#buildGrid()
  }

  setDebugOverlay(enabled: boolean) {
    this.#miniMapOverlay.visible = enabled
    // Force a render update for the overlay immediately
    if (this.#lastSnapshot) this.#renderDebugOverlay()
  }

  // ... Interactions & Camera Logic (Standard) ...
  
  private #animate(dt: number) {
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
      if (!entry.sprite.visible) continue; 

      entry.swayPhase += entry.swaySpeed * dt * 0.05
      entry.sprite.rotation = Math.sin(entry.swayPhase) * 0.15
    }
  }

  private #randomPlantTexture() {
    return this.#plantTextures[Math.floor(Math.random() * this.#plantTextures.length)]
  }

  private #modeColor(agent: AgentState) {
    return MODE_COLORS[agent.mode] ?? MODE_COLORS.sleep
  }

  private #bindInteractions() {
    if (!this.#app) return
    const canvas = this.#app.canvas
    canvas.addEventListener('wheel', this.#handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.#handlePointerDown)
    window.addEventListener('pointermove', this.#handlePointerMove)
    window.addEventListener('pointerup', this.#handlePointerUp)
    window.addEventListener('resize', () => this.fitToScreen())
  }

  private #handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9
    const target = { x: event.offsetX, y: event.offsetY }
    this.#zoomAt(target, zoomFactor)
  }

  private #handlePointerDown = (event: PointerEvent) => {
    this.#isPanning = true
    this.#lastPointer = { x: event.clientX, y: event.clientY }
  }

  private #handlePointerMove = (event: PointerEvent) => {
    if (!this.#isPanning || !this.#lastPointer) return
    const dx = event.clientX - this.#lastPointer.x
    const dy = event.clientY - this.#lastPointer.y
    this.#camera.position.x += dx
    this.#camera.position.y += dy
    this.#lastPointer = { x: event.clientX, y: event.clientY }
    this.#clampCamera()
  }

  private #handlePointerUp = () => {
    this.#isPanning = false
    this.#lastPointer = null
    this.#clampCamera()
  }

  private #zoomCentered(factor: number) {
    if (!this.#host) return
    const center = { x: this.#host.clientWidth / 2, y: this.#host.clientHeight / 2 }
    this.#zoomAt(center, factor)
  }

  private #zoomAt(screenPoint: { x: number; y: number }, factor: number) {
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

  private #screenToWorld(point: { x: number; y: number }, scale = this.#cameraScale) {
    const invScale = 1 / scale
    return {
      x: (point.x - this.#camera.position.x) * invScale,
      y: (point.y - this.#camera.position.y) * invScale,
    }
  }

  private #updateCamera() {
    this.#camera.scale.set(this.#cameraScale)
    this.#clampCamera()
  }

  private #clampCamera() {
    if (!this.#host) return
    const width = this.#host.clientWidth
    const height = this.#host.clientHeight
    const worldWidth = this.#worldBounds.x * this.#cameraScale
    const worldHeight = this.#worldBounds.y * this.#cameraScale
    
    // Allow panning slightly past edges
    const buffer = 100 * this.#cameraScale 
    const minX = Math.min(0, width - worldWidth) - buffer
    const minY = Math.min(0, height - worldHeight) - buffer

    this.#camera.position.x = clamp(this.#camera.position.x, minX, buffer)
    this.#camera.position.y = clamp(this.#camera.position.y, minY, buffer)
  }
  
  private #renderDebugOverlay() {
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
             overlay.circle(a.position.x, a.position.y, 2).fill(this.#modeColor(a))
        })
    }
  }

  private #buildGrid() {
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
  
  focusOnFamily(color: string) { /* implementation ... */ }
  focusOnAgent(agentId: number) { /* implementation ... */ }
}

function parseColor(hex: string) {
  const cleaned = hex.replace('#', '')
  return Number.parseInt(cleaned, 16)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export const pixiStage = new PixiStage()
