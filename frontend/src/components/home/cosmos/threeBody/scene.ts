import type { OrbitCamera, Projected } from './camera'
import { BODY_COUNT, type BodyVector, type OrbitTable } from './orbit'
import { ParticlePool } from './particles'

/** Ice white, signature cyan, deep azure — one tone per body. */
const TONES: ReadonlyArray<readonly [number, number, number]> = [
  [232, 246, 255],
  [112, 224, 237],
  [96, 165, 255],
]
const TONE_CSS = TONES.map(([r, g, b]) => `rgb(${r} ${g} ${b})`)

export const TRAIL_LENGTH = 150
export const TRAIL_INTERVAL = 1 / 60
const TRAIL_BATCH = 6
const EMIT_RATE = 70
const HALO_COUNT = 2600
const GHOST_STRIDE = 4
const RIPPLE_DURATION = 1.6

interface Ripple {
  x: number
  y: number
  age: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function createGlowSprite([r, g, b]: readonly [number, number, number]): HTMLCanvasElement {
  const size = 128
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgb(255 255 255 / 1)')
  gradient.addColorStop(0.08, `rgb(${r} ${g} ${b} / 0.9)`)
  gradient.addColorStop(0.3, `rgb(${r} ${g} ${b} / 0.28)`)
  gradient.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return sprite
}

/**
 * Canvas 2D renderer for the three-body stage: halo dust disc, ghost orbit,
 * comet trails, emitted dust, glowing bodies and click ripples. Everything
 * except the ripples lives in orbit-plane coordinates and spins with the camera.
 */
export class ThreeBodyScene {
  private readonly ctx: CanvasRenderingContext2D
  private readonly sprites = TONES.map(createGlowSprite)
  private readonly dust = new ParticlePool(3072)
  private readonly halo: { x: Float32Array; y: Float32Array; z: Float32Array; alpha: Float32Array; size: Float32Array }
  private readonly ghost: Float32Array
  private readonly trails = Array.from({ length: BODY_COUNT }, () => new Float32Array(TRAIL_LENGTH * 2))
  private trailHead = 0
  private trailFilled = 0
  private trailClock = 0
  private emitCarry = 0
  private ripples: Ripple[] = []
  private readonly point: Projected = { x: 0, y: 0, scale: 1 }
  private width = 0
  private height = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    table: OrbitTable,
  ) {
    this.ctx = ctx
    this.halo = ThreeBodyScene.createHalo()
    this.ghost = ThreeBodyScene.createGhost(table)
  }

  static create(canvas: HTMLCanvasElement, table: OrbitTable): ThreeBodyScene | null {
    const ctx = canvas.getContext('2d')
    return ctx ? new ThreeBodyScene(canvas, ctx, table) : null
  }

  private static createHalo() {
    const x = new Float32Array(HALO_COUNT)
    const y = new Float32Array(HALO_COUNT)
    const z = new Float32Array(HALO_COUNT)
    const alpha = new Float32Array(HALO_COUNT)
    const size = new Float32Array(HALO_COUNT)
    for (let i = 0; i < HALO_COUNT; i++) {
      // Most dust forms a ring just outside the orbit, densest at its inner edge; the rest is a faint core haze.
      const inRing = Math.random() < 0.82
      const radius = inRing ? 1.16 + Math.pow(Math.random(), 1.6) * 0.5 : Math.random() * 1.15
      const angle = Math.random() * Math.PI * 2
      x[i] = Math.cos(angle) * radius
      y[i] = Math.sin(angle) * radius
      z[i] = (Math.random() + Math.random() - 1) * 0.06
      alpha[i] = inRing ? rand(0.3, 0.9) * (1 - (radius - 1.16) / 0.75) : rand(0.05, 0.18)
      size[i] = rand(0.6, 1.5)
    }
    return { x, y, z, alpha, size }
  }

  /** Every body traces the same figure-eight, so body 0's path is the whole orbit. */
  private static createGhost(table: OrbitTable): Float32Array {
    const stride = BODY_COUNT * 2
    const points = new Float32Array(Math.floor(table.count / GHOST_STRIDE) * 2)
    for (let p = 0, s = 0; p < points.length; p += 2, s += GHOST_STRIDE) {
      points[p] = table.samples[s * stride]
      points[p + 1] = table.samples[s * stride + 1]
    }
    return points
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width
    this.height = height
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Records body positions into the comet trails at a fixed rate. */
  advanceTrails(bodies: BodyVector, dt: number): void {
    this.trailClock += dt
    while (this.trailClock >= TRAIL_INTERVAL) {
      this.trailClock -= TRAIL_INTERVAL
      this.pushTrail(bodies)
    }
  }

  pushTrail(bodies: BodyVector): void {
    this.trailHead = (this.trailHead + 1) % TRAIL_LENGTH
    for (let b = 0; b < BODY_COUNT; b++) {
      this.trails[b][this.trailHead * 2] = bodies[2 * b]
      this.trails[b][this.trailHead * 2 + 1] = bodies[2 * b + 1]
    }
    this.trailFilled = Math.min(TRAIL_LENGTH, this.trailFilled + 1)
  }

  /** Bodies shed dust that hangs in place and fades, drawing soft particle wakes. */
  emit(bodies: BodyVector, dt: number, energy: number): void {
    this.emitCarry += dt * EMIT_RATE * (1 + 2 * energy)
    const count = Math.floor(this.emitCarry)
    this.emitCarry -= count
    for (let n = 0; n < count; n++) {
      for (let b = 0; b < BODY_COUNT; b++) {
        this.dust.spawn({
          x: bodies[2 * b] + rand(-0.014, 0.014),
          y: bodies[2 * b + 1] + rand(-0.014, 0.014),
          z: rand(-0.02, 0.02),
          vx: rand(-0.03, 0.03),
          vy: rand(-0.03, 0.03),
          vz: rand(-0.03, 0.03),
          life: rand(1.6, 3.4),
          size: rand(0.8, 2),
          tone: b,
        })
      }
    }
  }

  /** Click feedback: a ripple in screen space plus a burst of dust in the orbital plane. */
  impulse(screenX: number, screenY: number, planeX: number, planeY: number): void {
    this.ripples.push({ x: screenX, y: screenY, age: 0 })
    for (let n = 0; n < 72; n++) {
      const angle = Math.random() * Math.PI * 2
      const speed = rand(0.25, 1.05)
      this.dust.spawn({
        x: planeX,
        y: planeY,
        z: rand(-0.03, 0.03),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: rand(-0.12, 0.12),
        life: rand(0.9, 1.9),
        size: rand(0.9, 2),
        tone: n % BODY_COUNT,
      })
    }
  }

  update(dt: number): void {
    this.dust.update(dt)
    for (const ripple of this.ripples) ripple.age += dt
    this.ripples = this.ripples.filter((ripple) => ripple.age < RIPPLE_DURATION + 0.2)
  }

  render(camera: OrbitCamera, bodies: BodyVector, energy: number): void {
    const { ctx } = this
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.globalCompositeOperation = 'lighter'
    this.drawHalo(camera)
    this.drawGhost(camera)
    this.drawTrails(camera)
    this.drawDust(camera)
    this.drawBodies(camera, bodies, energy)
    this.drawRipples()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawHalo(camera: OrbitCamera): void {
    const { ctx, halo, point } = this
    ctx.fillStyle = TONE_CSS[0]
    for (let i = 0; i < HALO_COUNT; i++) {
      camera.project(halo.x[i], halo.y[i], halo.z[i], point)
      const s = halo.size[i] * point.scale
      ctx.globalAlpha = Math.min(1, halo.alpha[i] * point.scale)
      ctx.fillRect(point.x - s / 2, point.y - s / 2, s, s)
    }
  }

  private drawGhost(camera: OrbitCamera): void {
    const { ctx, ghost, point } = this
    ctx.fillStyle = TONE_CSS[1]
    ctx.globalAlpha = 0.16
    for (let p = 0; p < ghost.length; p += 2) {
      camera.project(ghost[p], ghost[p + 1], 0, point)
      const s = 1.1 * point.scale
      ctx.fillRect(point.x - s / 2, point.y - s / 2, s, s)
    }
  }

  private drawTrails(camera: OrbitCamera): void {
    const { ctx, point } = this
    const filled = this.trailFilled
    if (filled < 2) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let b = 0; b < BODY_COUNT; b++) {
      const trail = this.trails[b]
      ctx.strokeStyle = TONE_CSS[b]
      // Walk from the oldest point to the newest, one batch of segments per stroke.
      for (let start = 0; start < filled - 1; start += TRAIL_BATCH) {
        const end = Math.min(filled - 1, start + TRAIL_BATCH)
        const progress = end / (filled - 1)
        ctx.globalAlpha = Math.pow(progress, 1.8) * 0.7
        ctx.lineWidth = 0.4 + progress * 2
        ctx.beginPath()
        for (let k = start; k <= end; k++) {
          const slot = (this.trailHead - (filled - 1 - k) + TRAIL_LENGTH) % TRAIL_LENGTH
          camera.project(trail[slot * 2], trail[slot * 2 + 1], 0, point)
          if (k === start) ctx.moveTo(point.x, point.y)
          else ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }
    }
  }

  private drawDust(camera: OrbitCamera): void {
    const { ctx, dust, point } = this
    for (let tone = 0; tone < TONES.length; tone++) {
      ctx.fillStyle = TONE_CSS[tone]
      for (let i = 0; i < dust.capacity; i++) {
        if (dust.tone[i] !== tone) continue
        const fade = dust.fade(i)
        if (fade <= 0) continue
        camera.project(dust.x[i], dust.y[i], dust.z[i], point)
        const s = dust.size[i] * point.scale
        ctx.globalAlpha = Math.pow(fade, 1.4) * 0.75
        ctx.fillRect(point.x - s / 2, point.y - s / 2, s, s)
      }
    }
  }

  private drawBodies(camera: OrbitCamera, bodies: BodyVector, energy: number): void {
    const { ctx, point } = this
    for (let b = 0; b < BODY_COUNT; b++) {
      camera.project(bodies[2 * b], bodies[2 * b + 1], 0, point)
      const { x, y, scale } = point
      const glow = (34 + energy * 22) * scale
      ctx.globalAlpha = 0.95
      ctx.drawImage(this.sprites[b], x - glow, y - glow, glow * 2, glow * 2)

      // Anamorphic streak: a thin horizontal flare through the core.
      const streak = (70 + energy * 50) * scale
      const flare = ctx.createLinearGradient(x - streak, y, x + streak, y)
      flare.addColorStop(0, 'rgb(255 255 255 / 0)')
      flare.addColorStop(0.5, TONE_CSS[b])
      flare.addColorStop(1, 'rgb(255 255 255 / 0)')
      ctx.globalAlpha = 0.32 + energy * 0.3
      ctx.fillStyle = flare
      ctx.fillRect(x - streak, y - 0.6, streak * 2, 1.2)

      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, (2.8 + energy) * scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawRipples(): void {
    const { ctx } = this
    const reach = Math.min(this.width, this.height) * 0.3
    ctx.strokeStyle = TONE_CSS[1]
    for (const ripple of this.ripples) {
      for (const delay of [0, 0.2]) {
        const p = (ripple.age - delay) / RIPPLE_DURATION
        if (p <= 0 || p >= 1) continue
        const eased = 1 - Math.pow(1 - p, 3)
        ctx.globalAlpha = Math.pow(1 - p, 2) * 0.6
        ctx.lineWidth = 1.4 * (1 - p) + 0.4
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, eased * reach, 0, Math.PI * 2)
        ctx.stroke()
      }
      const flash = 1 - ripple.age / 0.35
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.9
        ctx.drawImage(this.sprites[1], ripple.x - 36, ripple.y - 36, 72, 72)
      }
    }
  }
}
