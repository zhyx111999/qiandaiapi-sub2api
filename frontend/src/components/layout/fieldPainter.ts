import { strandY, type Strand, type StrandLayout } from '@/components/home/landing/convergence/strands'
import type { Pulse } from '@/components/home/landing/convergence/pulses'
import { LENSING, lensInto, type GlassRect } from './glassOptics'
import type { LensView } from './glassScene'

/**
 * Draws the console field: drifting glows, the landing page's strands and the calls travelling
 * along them. Seen through the sidebar glass the strands are lensed at its edge (with a faint
 * colour fringe), and under the selection capsule they are magnified, so neither the sidebar nor
 * the capsule needs a live backdrop filter. Everything is drawn in one pass per frame.
 */
export const FIELD_STEP = 6 // px between polyline points
const ACCENT_EVERY = 9
const DENSITY = 1.6
const COLORS = {
  light: { ink: '31 29 26', accent: '59 146 113', red: '255 96 64', blue: '64 128 255' },
  dark: { ink: '235 236 229', accent: '101 184 150', red: '255 120 96', blue: '96 150 255' },
} as const
const GLOWS = [
  { x: 0.2, y: 0.26, r: 260, rgb: '59 146 113', a: 0.22, sx: 0.13, sy: 0.11, ax: 40, ay: 70, phase: 0 },
  { x: 0.34, y: 0.72, r: 300, rgb: '214 170 96', a: 0.14, sx: 0.09, sy: 0.15, ax: 50, ay: 60, phase: 2.1 },
  { x: 0.06, y: 0.96, r: 230, rgb: '101 179 148', a: 0.18, sx: 0.17, sy: 0.07, ax: 30, ay: 40, phase: 4.2 },
] as const
const FRINGE_ALPHA = 0.32

type Palette = (typeof COLORS)['light'] | (typeof COLORS)['dark']

export interface FieldScene {
  width: number
  height: number
  dark: boolean
  waveTime: number
  glowTime: number
  pulses: readonly Pulse[]
  pulseTail: number
  /** Fraction of the width where the fade-out toward the workspace starts. */
  fadeFrom: number
  /** The sidebar glass, or null to draw the field plainly. */
  glass: GlassRect | null
  /** The selection capsule inside the glass, or null. */
  lens: LensView | null
}

export class FieldPainter {
  private cols = 0
  private py: Float32Array[] = [] // backdrop y per strand and column
  private wx: Float32Array[] = [] // lensed through the glass edge
  private wy: Float32Array[] = []
  private ax: Float32Array[] = [] // scratch for the colour fringes
  private ay: Float32Array[] = []
  private mx: Float32Array[] = [] // magnified under the capsule
  private my: Float32Array[] = []
  private readonly look: { accent: boolean; alpha: number; width: number }[]

  constructor(private readonly strands: Strand[]) {
    const widen = 1 + (DENSITY - 1) * 0.25
    this.look = strands.map((strand, index) => {
      const accent = index % ACCENT_EVERY === ACCENT_EVERY >> 1
      return {
        accent,
        alpha: Math.min(1, (accent ? 0.5 : 0.14 + strand.weight * 0.3) * DENSITY),
        width: (0.7 + strand.weight * 0.9) * widen,
      }
    })
  }

  paint(c: CanvasRenderingContext2D, scene: FieldScene): void {
    const { width: w, height: h } = scene
    c.clearRect(0, 0, w, h)
    if (!w || !h) return
    this.ensure(w)
    const col = scene.dark ? COLORS.dark : COLORS.light
    this.glows(c, scene)

    const layout: StrandLayout = {
      width: w,
      height: h,
      fanTop: -h * 0.04,
      fanBottom: h * 1.04,
      gateY: h * 0.56,
      entryX: w * 0.7,
      exitX: w * 0.7,
      waist: h * 0.14,
    }
    for (let i = 0; i < this.strands.length; i++) {
      const ys = this.py[i]
      for (let k = 0; k < this.cols; k++) ys[k] = strandY(this.strands[i], k * FIELD_STEP, layout, scene.waveTime)
    }

    const g = scene.glass
    if (!g) {
      this.strokeStrands(c, null, this.py, col)
      this.strokePulses(c, null, this.py, col, scene)
    } else {
      // Outside the glass: the field as it is.
      c.save()
      c.beginPath()
      c.rect(0, 0, w, h)
      c.roundRect(g.x, g.y, g.w, g.h, g.r)
      c.clip('evenodd')
      this.strokeStrands(c, null, this.py, col)
      this.strokePulses(c, null, this.py, col, scene)
      c.restore()
      this.throughGlass(c, g, col, scene)
    }

    // Fade into the workspace so cards and tables stay on clean paper.
    const fadeStart = w * scene.fadeFrom
    const fade = c.createLinearGradient(fadeStart, 0, w, 0)
    fade.addColorStop(0, 'rgb(0 0 0 / 0)')
    fade.addColorStop(1, 'rgb(0 0 0 / 1)')
    c.globalCompositeOperation = 'destination-out'
    c.fillStyle = fade
    c.fillRect(fadeStart, 0, w - fadeStart, h)
    c.globalCompositeOperation = 'source-over'
  }

  private throughGlass(c: CanvasRenderingContext2D, g: GlassRect, col: Palette, scene: FieldScene) {
    const reach = LENSING.edge + LENSING.spread + 2
    const c0 = Math.max(0, Math.floor((g.x - reach) / FIELD_STEP))
    const c1 = Math.min(this.cols - 1, Math.ceil((g.x + g.w + reach) / FIELD_STEP))
    if (c0 > c1) return
    c.save()
    c.beginPath()
    c.roundRect(g.x, g.y, g.w, g.h, g.r)
    c.clip()
    this.lensAll(g, LENSING.edge, this.wx, this.wy, c0, c1)
    this.strokeStrands(c, this.wx, this.wy, col, 1, null, c0, c1)
    this.strokePulses(c, this.wx, this.wy, col, scene, c0, c1)

    // Colour fringes, only in the bending band: red bends a little more, blue a little less.
    const band = LENSING.band
    c.save()
    c.beginPath()
    c.roundRect(g.x, g.y, g.w, g.h, g.r)
    c.roundRect(g.x + band, g.y + band, Math.max(0, g.w - 2 * band), Math.max(0, g.h - 2 * band), Math.max(0, g.r - band))
    c.clip('evenodd')
    this.lensAll(g, LENSING.edge + LENSING.spread, this.ax, this.ay, c0, c1)
    this.strokeStrands(c, this.ax, this.ay, col, FRINGE_ALPHA, col.red, c0, c1)
    this.lensAll(g, LENSING.edge - LENSING.spread, this.ax, this.ay, c0, c1)
    this.strokeStrands(c, this.ax, this.ay, col, FRINGE_ALPHA, col.blue, c0, c1)
    c.restore()

    const lens = scene.lens
    if (lens && lens.bandBottom > lens.bandTop) {
      // The capsule magnifies what the glass shows under it, instead of sampling the glass again.
      const cx = lens.x + lens.w / 2
      const cy = lens.y + lens.h / 2
      const m = LENSING.magnify
      c.save()
      c.beginPath()
      c.rect(lens.x - 1, lens.bandTop, lens.w + 2, lens.bandBottom - lens.bandTop)
      c.clip()
      c.beginPath()
      c.roundRect(lens.x, lens.y, lens.w, lens.h, lens.r)
      c.clip()
      c.clearRect(lens.x, lens.y, lens.w, lens.h)
      this.glows(c, scene)
      for (let i = 0; i < this.strands.length; i++) {
        const wx = this.wx[i]
        const wy = this.wy[i]
        const mx = this.mx[i]
        const my = this.my[i]
        for (let k = c0; k <= c1; k++) {
          mx[k] = cx + (wx[k] - cx) * m
          my[k] = cy + (wy[k] - cy) * m
        }
      }
      this.strokeStrands(c, this.mx, this.my, col, 1, null, c0, c1)
      this.strokePulses(c, this.mx, this.my, col, scene, c0, c1)
      c.restore()
    }
    c.restore()
  }

  private lensAll(g: GlassRect, k: number, outX: Float32Array[], outY: Float32Array[], c0: number, c1: number) {
    for (let i = 0; i < this.strands.length; i++) lensInto(null, this.py[i], FIELD_STEP, g, k, outX[i], outY[i], c0, c1)
  }

  private glows(c: CanvasRenderingContext2D, scene: FieldScene) {
    for (const glow of GLOWS) {
      const x = glow.x * scene.width + Math.sin(scene.glowTime * glow.sx + glow.phase) * glow.ax
      const y = glow.y * scene.height + Math.cos(scene.glowTime * glow.sy + glow.phase) * glow.ay
      const gradient = c.createRadialGradient(x, y, 0, x, y, glow.r)
      gradient.addColorStop(0, `rgb(${glow.rgb} / ${scene.dark ? glow.a * 0.75 : glow.a})`)
      gradient.addColorStop(1, `rgb(${glow.rgb} / 0)`)
      c.fillStyle = gradient
      c.fillRect(x - glow.r, y - glow.r, glow.r * 2, glow.r * 2)
    }
  }

  /** Strokes every strand over columns c0..c1, in its own colour or `tint`. */
  private strokeStrands(
    c: CanvasRenderingContext2D,
    xs: Float32Array[] | null,
    ys: Float32Array[],
    col: Palette,
    alphaScale = 1,
    tint: string | null = null,
    c0 = 0,
    c1 = this.cols - 1,
  ) {
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (let i = 0; i < this.strands.length; i++) {
      const look = this.look[i]
      const x = xs ? xs[i] : null
      const y = ys[i]
      c.strokeStyle = `rgb(${tint ?? (look.accent ? col.accent : col.ink)} / ${look.alpha * alphaScale})`
      c.lineWidth = look.width
      c.beginPath()
      c.moveTo(x ? x[c0] : c0 * FIELD_STEP, y[c0])
      for (let k = c0 + 1; k <= c1; k++) c.lineTo(x ? x[k] : k * FIELD_STEP, y[k])
      c.stroke()
    }
  }

  /**
   * Same look as the landing page calls: a fading trail, a soft glow and a bright head. Only
   * columns c0..c1 are drawn (lensed arrays are only filled there).
   */
  private strokePulses(
    c: CanvasRenderingContext2D,
    xs: Float32Array[] | null,
    ys: Float32Array[],
    col: Palette,
    scene: FieldScene,
    c0 = 0,
    c1 = this.cols - 1,
  ) {
    const last = this.cols - 1
    const column = (x: number) => Math.max(0, Math.min(last, Math.round(x / FIELD_STEP)))
    for (const pulse of scene.pulses) {
      const y = ys[pulse.strand]
      if (!y) continue
      const x = xs ? xs[pulse.strand] : null
      const at = (k: number) => (x ? x[k] : k * FIELD_STEP)
      const headColumn = column(pulse.x)
      const head = Math.min(c1, headColumn)
      const tail = Math.max(c0, column(pulse.x - scene.pulseTail))
      if (head <= tail) continue
      const trail = c.createLinearGradient(at(tail), y[tail], at(head), y[head])
      trail.addColorStop(0, `rgb(${col.accent} / 0)`)
      trail.addColorStop(1, `rgb(${col.accent} / 0.95)`)
      c.strokeStyle = trail
      c.lineWidth = 1.8
      c.beginPath()
      c.moveTo(at(tail), y[tail])
      for (let k = tail + 1; k <= head; k++) c.lineTo(at(k), y[k])
      c.stroke()
      // The head has left the field (or this range); only the tail remains.
      if (pulse.x > last * FIELD_STEP || headColumn !== head) continue
      const hx = at(head)
      const hy = y[head]
      const glow = c.createRadialGradient(hx, hy, 0, hx, hy, 14)
      glow.addColorStop(0, `rgb(${col.accent} / 0.42)`)
      glow.addColorStop(1, `rgb(${col.accent} / 0)`)
      c.fillStyle = glow
      c.fillRect(hx - 14, hy - 14, 28, 28)
      c.fillStyle = `rgb(${col.accent})`
      c.beginPath()
      c.arc(hx, hy, 2.4, 0, Math.PI * 2)
      c.fill()
    }
  }

  private ensure(width: number) {
    const cols = Math.floor(width / FIELD_STEP) + 1
    if (cols === this.cols) return
    this.cols = cols
    const make = () => this.strands.map(() => new Float32Array(cols))
    this.py = make()
    this.wx = make()
    this.wy = make()
    this.ax = make()
    this.ay = make()
    this.mx = make()
    this.my = make()
  }
}
