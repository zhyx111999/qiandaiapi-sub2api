import type { StrandDisturbance } from './disturbance'
import { GlassWordmark } from './glassWordmark'
import type { PulseTrain } from './pulses'
import { createStrands, strandY, type Strand, type StrandLayout } from './strands'

/** 'r g b' channel strings, read from the page's CSS variables. */
export interface Palette {
  ink: string
  accent: string
  frost: string
}

export interface SceneLayout extends StrandLayout {
  gateX: number
  fontSize: number
  dpr: number
}

/** Where the stage wants the wordmark and the strand fan, in CSS px. */
export interface StageMetrics {
  width: number
  height: number
  dpr: number
  gateY: number
  fontSize: number
  fanTop: number
  fanBottom: number
}

export const PULSE_TAIL = 170

const SAMPLE_STEP = 6 // px between polyline points
const OVERSCAN = 40 // px drawn beyond each side edge
const ACCENT_EVERY = 11 // every n-th strand is drawn in the accent colour
const LENS = 1.32 // vertical magnification seen through the glass letters
const RIPPLE_DURATION = 1.2
const MIN_CONVERGE = 0.22 // strands get at least this fraction of the width to converge
const EDGE_FADE: readonly [number, number] = [0.12, 0.07] // fraction of the width faded in / out at each side

interface Ripple {
  x: number
  y: number
  age: number
}

/**
 * Canvas 2D renderer of the convergence field: ink strands, travelling call
 * pulses, click ripples and the frosted glass wordmark they pass through.
 * The paper itself is CSS behind the canvas, so frames clear to transparent.
 */
export class ConvergenceScene {
  readonly strands: Strand[]
  private readonly wordmark: GlassWordmark
  private layout: SceneLayout | null = null
  private xs = new Float32Array(0)
  private ys: Float32Array[] = []
  private ripples: Ripple[] = []

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly palette: Palette,
    wordmarkText: string,
    fontFamily: string,
    strandCount: number,
  ) {
    this.strands = createStrands(strandCount)
    this.wordmark = new GlassWordmark(wordmarkText, {
      family: fontFamily,
      weight: 800,
      tracking: -0.045,
      ink: palette.ink,
      frost: palette.frost,
    })
  }

  static create(
    canvas: HTMLCanvasElement,
    palette: Palette,
    wordmarkText: string,
    fontFamily: string,
    strandCount: number,
  ): ConvergenceScene | null {
    const ctx = canvas.getContext('2d')
    return ctx ? new ConvergenceScene(canvas, ctx, palette, wordmarkText, fontFamily, strandCount) : null
  }

  get current(): SceneLayout | null {
    return this.layout
  }

  /**
   * Lays out the field around a wordmark centred horizontally at `gateY`. When the
   * wordmark leaves too little room on the sides (phones), the strands keep
   * converging behind the glass letters instead of bending sharply at the edge.
   */
  resize({ width, height, dpr, gateY, fontSize, fanTop, fanBottom }: StageMetrics): void {
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)

    const gateX = width / 2
    this.wordmark.layout(gateX, gateY, fontSize, dpr)
    const box = this.wordmark.bounds
    const halfText = box ? (box.width - fontSize * 0.8) / 2 : width * 0.3
    const entryX = Math.max(width * MIN_CONVERGE, gateX - halfText - fontSize * 0.3)
    this.layout = {
      width,
      height,
      dpr,
      fanTop,
      fanBottom,
      gateX,
      gateY,
      fontSize,
      entryX,
      exitX: width - entryX,
      waist: fontSize * 0.19,
    }

    const count = Math.ceil((width + OVERSCAN * 2) / SAMPLE_STEP) + 1
    this.xs = Float32Array.from({ length: count }, (_, i) => -OVERSCAN + i * SAMPLE_STEP)
    this.ys = this.strands.map(() => new Float32Array(count))
  }

  /** Recomputes every strand polyline for this frame. */
  update(time: number, dt: number, disturbance: StrandDisturbance): void {
    const { layout, xs } = this
    if (!layout) return
    this.strands.forEach((strand, s) => {
      const ys = this.ys[s]
      for (let i = 0; i < xs.length; i++) {
        const base = strandY(strand, xs[i], layout, time)
        ys[i] = base + disturbance.offset(xs[i], base)
      }
    })
    for (const ripple of this.ripples) ripple.age += dt
    this.ripples = this.ripples.filter((ripple) => ripple.age < RIPPLE_DURATION + 0.3)
  }

  /** Index of the strand passing closest to (x, y) in the current frame. */
  nearestStrand(x: number, y: number): number {
    const column = this.column(x)
    let best = 0
    let bestDistance = Infinity
    this.ys.forEach((ys, s) => {
      const distance = Math.abs(ys[column] - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = s
      }
    })
    return best
  }

  ripple(x: number, y: number): void {
    this.ripples.push({ x, y, age: 0 })
  }

  render(time: number, pulses: PulseTrain): void {
    const { ctx, layout } = this
    if (!layout) return
    ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0)
    ctx.clearRect(0, 0, layout.width, layout.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    this.wordmark.drawShadow(ctx)
    this.drawStrands(ctx, 0, this.xs.length - 1, 1)
    this.drawPulses(ctx, pulses, 1)
    this.fadeEdges(ctx, layout)
    this.wordmark.draw(ctx, time, (inside) => {
      const box = this.wordmark.bounds
      if (!box) return
      // Lens: what lies behind the letters appears magnified about the gate line; the frost blur comes after.
      inside.translate(0, layout.gateY)
      inside.scale(1, LENS)
      inside.translate(0, -layout.gateY)
      inside.lineCap = 'round'
      inside.lineJoin = 'round'
      this.drawStrands(inside, this.column(box.x), this.column(box.x + box.width), 1.6)
      this.drawPulses(inside, pulses, 1.6)
    })
    this.drawRipples(ctx)
  }

  /** Strands emerge from the paper on the left and dissolve into it on the right. */
  private fadeEdges(ctx: CanvasRenderingContext2D, layout: SceneLayout): void {
    const [fadeIn, fadeOut] = EDGE_FADE
    const { width, height } = layout
    const mask = ctx.createLinearGradient(0, 0, width, 0)
    mask.addColorStop(0, 'rgb(0 0 0 / 1)')
    mask.addColorStop(fadeIn, 'rgb(0 0 0 / 0)')
    mask.addColorStop(1 - fadeOut, 'rgb(0 0 0 / 0)')
    mask.addColorStop(1, 'rgb(0 0 0 / 0.85)')
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = mask
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  private column(x: number): number {
    return Math.min(this.xs.length - 1, Math.max(0, Math.round((x + OVERSCAN) / SAMPLE_STEP)))
  }

  /** `soften` > 1 draws wider, fainter lines (the view through frosted glass). */
  private drawStrands(ctx: CanvasRenderingContext2D, from: number, to: number, soften: number): void {
    const { xs, palette } = this
    this.strands.forEach((strand, s) => {
      const ys = this.ys[s]
      const accent = s % ACCENT_EVERY === ACCENT_EVERY >> 1
      const alpha = (accent ? 0.62 : 0.14 + strand.weight * 0.34) / soften
      ctx.strokeStyle = `rgb(${accent ? palette.accent : palette.ink} / ${alpha})`
      ctx.lineWidth = (0.55 + strand.weight * 0.75) * soften
      ctx.beginPath()
      ctx.moveTo(xs[from], ys[from])
      for (let i = from + 1; i <= to; i++) ctx.lineTo(xs[i], ys[i])
      ctx.stroke()
    })
  }

  private drawPulses(ctx: CanvasRenderingContext2D, pulses: PulseTrain, soften: number): void {
    const { xs, palette } = this
    for (const pulse of pulses.pulses) {
      const ys = this.ys[pulse.strand]
      if (!ys) continue
      const head = this.column(pulse.x)
      const tail = this.column(pulse.x - PULSE_TAIL)
      if (head <= tail) continue

      const trail = ctx.createLinearGradient(xs[tail], ys[tail], xs[head], ys[head])
      trail.addColorStop(0, `rgb(${palette.accent} / 0)`)
      trail.addColorStop(1, `rgb(${palette.accent} / ${0.95 / Math.sqrt(soften)})`)
      ctx.strokeStyle = trail
      ctx.lineWidth = 1.7 * soften
      ctx.beginPath()
      ctx.moveTo(xs[tail], ys[tail])
      for (let i = tail + 1; i <= head; i++) ctx.lineTo(xs[i], ys[i])
      ctx.stroke()

      const x = xs[head]
      const y = ys[head]
      const glowRadius = 14 * soften
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
      glow.addColorStop(0, `rgb(${palette.accent} / 0.42)`)
      glow.addColorStop(1, `rgb(${palette.accent} / 0)`)
      ctx.fillStyle = glow
      ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2)
      ctx.fillStyle = `rgb(${palette.accent})`
      ctx.beginPath()
      ctx.arc(x, y, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    const { palette } = this
    for (const ripple of this.ripples) {
      for (const delay of [0, 0.18]) {
        const p = (ripple.age - delay) / RIPPLE_DURATION
        if (p <= 0 || p >= 1) continue
        const radius = 12 + (1 - Math.pow(1 - p, 3)) * 110
        ctx.strokeStyle = `rgb(${palette.accent} / ${Math.pow(1 - p, 2) * 0.55})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
}
