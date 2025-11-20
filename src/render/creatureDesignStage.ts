import { Application, Container, Graphics } from 'pixi.js'

import type { CreatureDesignConfig, CreaturePatternStyle } from '@/types/creatureDesign'
import {
  CREATURE_VARIANT_ORDER,
  VARIANT_PROFILE,
  type CreatureVariant,
  type CreatureDimensions,
  type CreaturePalette,
  type VariantProfile,
  computeDimensions,
  buildPalette,
  clamp01,
} from '@/render/creatureLook'

type CreatureParts = {
  container: Container
  body: Graphics
  pattern: Graphics
  plating: Graphics
  accents: Graphics
  tail: Graphics
  head: Graphics
  eye: Graphics
  glow: Graphics
}

export class CreatureDesignStage {
  #app?: Application
  #host?: HTMLElement
  #background = new Graphics()
  #sparkLayer = new Graphics()
  #creatureLayer = new Container()
  #creatures = new Map<CreatureVariant, CreatureParts>()
  #resizeObserver?: ResizeObserver
  #glowPhase = 0
  #currentConfig: CreatureDesignConfig | null = null
  #variantOrder: CreatureVariant[] = CREATURE_VARIANT_ORDER

  async init(host: HTMLElement, variants: CreatureVariant[] = CREATURE_VARIANT_ORDER) {
    this.#host = host
    this.#variantOrder = variants.length ? variants : CREATURE_VARIANT_ORDER
    this.#app = new Application()
    await this.#app.init({
      background: '#030813',
      antialias: true,
      autoDensity: true,
      preference: 'webgpu',
      resolution: window.devicePixelRatio || 1,
      resizeTo: host,
    })

    host.innerHTML = ''
    host.appendChild(this.#app.canvas)

    this.#app.stage.addChild(this.#background, this.#creatureLayer, this.#sparkLayer)

    this.#variantOrder.forEach((variant) => {
      const parts = this.#createCreature()
      this.#creatures.set(variant, parts)
      this.#creatureLayer.addChild(parts.container)
    })

    this.#drawBackdrop()
    this.#layoutCreatures()
    this.#resizeObserver = new ResizeObserver(() => {
      this.#layoutCreatures()
      this.#drawBackdrop()
      if (this.#currentConfig) {
        this.render(this.#currentConfig)
      }
    })
    this.#resizeObserver.observe(host)

    this.#app.ticker.add((ticker) => this.#animateGlow(ticker.deltaTime))
  }

  render(config: CreatureDesignConfig) {
    if (!this.#app) return
    this.#currentConfig = config

    this.#variantOrder.forEach((variant) => {
      this.#drawCreature(variant, config)
    })
  }

  destroy() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
    this.#creatures.clear()
    if (this.#host) {
      this.#host.innerHTML = ''
    }
    this.#app?.destroy(true, { children: true })
    this.#app = undefined
    this.#host = undefined
  }

  #createCreature(): CreatureParts {
    const container = new Container()
    container.eventMode = 'none'
    const tail = new Graphics()
    const body = new Graphics()
    const pattern = new Graphics()
    const plating = new Graphics()
    const accents = new Graphics()
    const head = new Graphics()
    const eye = new Graphics()
    const glow = new Graphics()
    glow.alpha = 0.65
    container.addChild(tail, body, pattern, plating, accents, head, glow, eye)
    return { container, body, pattern, plating, accents, tail, head, eye, glow }
  }

  #layoutCreatures() {
    if (!this.#host) return
    const width = this.#host.clientWidth || 960
    const height = this.#host.clientHeight || 520
    const laneY = height * 0.62
    const slotWidth = width / (this.#variantOrder.length + 1)

    this.#variantOrder.forEach((variant, index) => {
      const parts = this.#creatures.get(variant)
      if (!parts) return
      const profile = VARIANT_PROFILE[variant]
      const x = slotWidth * (index + 1)
      const y = laneY + profile.elevation
      parts.container.position.set(x, y)
    })
  }

  #drawBackdrop() {
    if (!this.#host) return
    const width = this.#host.clientWidth || 960
    const height = this.#host.clientHeight || 520

    this.#background.clear()
    this.#background.rect(0, 0, width, height).fill({ color: 0x050918 })

    const horizon = height * 0.65
    this.#background
      .moveTo(0, horizon)
      .lineTo(width, horizon)
      .stroke({ color: 0x1d2749, alpha: 0.6, width: 1 })

    const step = width / 8
    for (let i = 0; i <= 8; i++) {
      const x = i * step
      this.#background
        .moveTo(x, horizon)
        .lineTo(x + 30, horizon - 90)
        .stroke({ color: 0x0f172a, alpha: 0.2, width: 1 })
    }

    this.#sparkLayer.clear()
    for (let i = 0; i < 12; i++) {
      const x = (width / 12) * i + (i % 2 === 0 ? 20 : -10)
      const y = height * 0.18 + (i % 3) * 14
      this.#sparkLayer.circle(x, y, 2).fill({ color: 0x38bdf8, alpha: 0.12 })
    }
  }

  #drawCreature(variant: CreatureVariant, config: CreatureDesignConfig) {
    const parts = this.#creatures.get(variant)
    if (!parts) return
    const profile = VARIANT_PROFILE[variant]
    const dims = computeDimensions(config, profile)
    const palette = buildPalette(config, variant)

    this.#drawTail(parts.tail, dims, palette)
    this.#drawBody(parts.body, dims, palette)
    this.#drawPattern(parts.pattern, dims, palette, config.patternStyle)
    this.#drawPlating(parts.plating, dims, palette, config.platingStrength)
    this.#drawHead(parts.head, dims, palette, profile)
    this.#drawAccents(parts.accents, dims, palette, config.headCrest)
    this.#drawEye(parts.eye, dims, palette, variant)
    this.#drawGlow(parts.glow, dims, palette, config.lumens)
  }

  #drawBody(body: Graphics, dims: CreatureDimensions, palette: CreaturePalette) {
    body.clear()
    body
      .roundRect(-dims.length / 2, -dims.thickness / 2, dims.length, dims.thickness, dims.thickness * 0.45)
      .fill({ color: palette.base })
    body
      .roundRect(-dims.length * 0.4, -dims.thickness * 0.25, dims.length * 0.6, dims.thickness * 0.5, dims.thickness * 0.3)
      .fill({ color: palette.underbelly, alpha: 0.5 })
  }

  #drawTail(tail: Graphics, dims: CreatureDimensions, palette: CreaturePalette) {
    tail.clear()
    const start = -dims.length / 2
    tail
      .moveTo(start, 0)
      .quadraticCurveTo(start - dims.tailLength * 0.2, -dims.thickness * 0.25, start - dims.tailLength, -3)
      .quadraticCurveTo(start - dims.tailLength * 0.25, dims.thickness * 0.3, start, dims.thickness * 0.15)
      .fill({ color: palette.accent, alpha: 0.75 })

    tail
      .moveTo(start - dims.tailLength * 0.45, -dims.thickness * 0.2)
      .quadraticCurveTo(start - dims.tailLength * 0.3, -dims.thickness * 0.6, start - dims.tailLength * 0.05, -dims.thickness * 0.2)
      .stroke({ color: palette.accent, width: 3, alpha: 0.6 })
  }

  #drawPattern(
    pattern: Graphics,
    dims: CreatureDimensions,
    palette: CreaturePalette,
    patternStyle: CreaturePatternStyle,
  ) {
    pattern.clear()
    if (patternStyle === 'stripes') {
      const spacing = dims.length / (6 + dims.length / 80)
      for (let x = -dims.length / 2 + spacing; x < dims.length / 2; x += spacing) {
        pattern
          .moveTo(x, -dims.thickness / 2)
          .lineTo(x + spacing * 0.35, dims.thickness / 2)
          .stroke({ color: palette.pattern, width: 3, alpha: 0.35 })
      }
      return
    }

    if (patternStyle === 'dapples') {
      const dots = 6
      for (let i = 0; i < dots; i++) {
        const offsetX = -dims.length / 2 + (i + 1) * (dims.length / (dots + 1))
        const offsetY = (i % 2 === 0 ? -1 : 1) * dims.thickness * 0.25
        const radius = dims.thickness * (0.12 + (i % 3) * 0.02)
        pattern.circle(offsetX, offsetY, radius).fill({ color: palette.pattern, alpha: 0.3 })
      }
      return
    }

    // spines
    const segments = Math.max(4, Math.round(dims.length / 40))
    const top = -dims.thickness / 2
    for (let i = 0; i < segments; i++) {
      const progress = i / segments
      const x = -dims.length / 2 + progress * dims.length
      const height = dims.crestHeight * 0.35 * (1 - Math.abs(progress - 0.5) * 1.2)
      pattern
        .moveTo(x, top)
        .lineTo(x + 8, top - height)
        .lineTo(x + 16, top)
        .lineTo(x, top)
        .fill({ color: palette.accent, alpha: 0.4 })
    }
  }

  #drawPlating(plating: Graphics, dims: CreatureDimensions, palette: CreaturePalette, strength: number) {
    plating.clear()
    const segments = dims.platingSegments
    const baseY = dims.thickness / 2
    const width = dims.length / segments
    for (let i = 0; i < segments; i++) {
      const x = -dims.length / 2 + i * width
      const height = (strength + 0.3) * 16
      plating
        .moveTo(x, baseY)
        .quadraticCurveTo(x + width / 2, baseY + height, x + width, baseY)
        .stroke({ color: palette.accent, width: 2, alpha: 0.35 })
    }
  }

  #drawHead(head: Graphics, dims: CreatureDimensions, palette: CreaturePalette, profile: VariantProfile) {
    head.clear()
    const width = dims.headSize * (1.2 + profile.headBias * 0.3)
    const height = dims.headSize * 0.8
    const headX = dims.headAnchor - width / 2
    head.roundRect(headX, -height / 2, width, height, height * 0.5).fill({ color: palette.base })
    head
      .ellipse(dims.headAnchor, -height / 2 - dims.crestHeight * 0.35, width * 0.3, dims.crestHeight * 0.55)
      .fill({ color: palette.accent, alpha: 0.8 })
  }

  #drawAccents(accents: Graphics, dims: CreatureDimensions, palette: CreaturePalette, crestInput: number) {
    accents.clear()
    const crestRun = clamp01(crestInput + 0.1)
    const crestHeight = dims.crestHeight * 0.6 * crestRun
    const crestLength = dims.length * 0.35
    const start = -crestLength / 2
    accents
      .moveTo(start, -dims.thickness / 2)
      .quadraticCurveTo(start + crestLength / 2, -dims.thickness / 2 - crestHeight, start + crestLength, -dims.thickness / 2)
      .stroke({ color: palette.accent, width: 4, alpha: 0.55 })
  }

  #drawEye(eye: Graphics, dims: CreatureDimensions, palette: CreaturePalette, variant: CreatureVariant) {
    eye.clear()
    const radius = Math.max(4, dims.headSize * 0.14)
    const offsetX = dims.headAnchor + radius * 0.2
    const offsetY = radius * -0.2
    eye.circle(offsetX, offsetY, radius).fill({ color: 0x0f172a })
    const pupil = variant === 'hunter' ? radius * 0.5 : radius * 0.7
    eye
      .circle(offsetX + radius * 0.2, offsetY - radius * 0.2, pupil)
      .fill({ color: palette.glow, alpha: 0.85 })
    eye.circle(offsetX + radius * 0.4, offsetY - radius * 0.5, pupil * 0.3).fill({ color: 0xffffff, alpha: 0.6 })
  }

  #drawGlow(glow: Graphics, dims: CreatureDimensions, palette: CreaturePalette, lumens: number) {
    glow.clear()
    const radius = dims.headSize * (1.2 + lumens * 0.8)
    const alpha = 0.2 + lumens * 0.5
    glow.circle(dims.headAnchor + radius * 0.1, -radius * 0.2, radius).fill({ color: palette.glow, alpha })
  }

  #animateGlow(delta: number) {
    this.#glowPhase += delta * 0.02
    const pulse = 0.85 + Math.sin(this.#glowPhase) * 0.1
    this.#creatures.forEach((parts) => {
      parts.glow.alpha = pulse
    })
  }
}
