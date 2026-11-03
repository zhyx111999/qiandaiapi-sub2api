import { PosedLines, placementMatrix, traceLines, type Placement, type Point } from '@/components/common/lineArt/lineFigure'
import { ORCA_VIEWBOX, orcaStrokes } from '@/components/common/lineArt/orcaArt'
import { orcaDrawn, orcaSwim } from '@/components/common/lineArt/orcaMotion'
import { LENSING, lensInto, type GlassRect } from './glassOptics'
import type { LensView } from './glassScene'

/**
 * Draws the console field's orca: the cover's line drawing, drawn on once and then swimming in
 * place, its head behind the sidebar glass and its tail reaching toward the workspace. Seen
 * through the glass it is lensed at the edge (with a faint colour fringe), and under the selection
 * capsule it is magnified, so neither the sidebar nor the capsule needs a live backdrop filter.
 * Everything is drawn in one pass per frame; what does not change per frame stays out of the
 * canvas (the glows are elements below it, the fade toward the workspace is the canvas container's
 * mask, see ConsoleBackdrop).
 */
const COLORS = {
  light: { ink: '31 29 26', red: '255 96 64', blue: '64 128 255' },
  dark: { ink: '235 236 229', red: '255 120 96', blue: '96 150 255' },
} as const
const LOOK = { alpha: { light: 0.52, dark: 0.42 }, width: 1.8 } as const
const FRINGE_ALPHA = 0.32

/** The orca across the sidebar's edge: its width (px, at most a share of the field), left inset and height. */
const ORCA_PLACE = { width: 440, widthShare: 0.72, left: 24, y: 0.68, angle: 4 } as const
const ORCA_CENTRE: Point = [ORCA_VIEWBOX.width / 2, ORCA_VIEWBOX.height / 2]

type Palette = (typeof COLORS)['light'] | (typeof COLORS)['dark']

export interface FieldScene {
  width: number
  height: number
  dark: boolean
  /** Orca clock, s: its swim. */
  time: number
  /** s since the orca started being drawn (Infinity shows it finished). */
  elapsed: number
  /** The sidebar glass, or null to draw the field plainly. */
  glass: GlassRect | null
  /** The selection capsule inside the glass, or null. */
  lens: LensView | null
}

/** Where the orca rests in a field `width` × `height` px: facing left, head up a little. */
export function fieldOrcaPlacement(width: number, height: number): Placement {
  const size = Math.min(ORCA_PLACE.width, width * ORCA_PLACE.widthShare)
  return {
    x: ORCA_PLACE.left + size / 2,
    y: height * ORCA_PLACE.y,
    anchor: ORCA_CENTRE,
    scale: size / ORCA_VIEWBOX.width,
    angle: ORCA_PLACE.angle,
    mirror: true,
  }
}

export class FieldPainter {
  private readonly strokes = orcaStrokes()
  private readonly posed = new PosedLines(this.strokes)
  private readonly wx = this.buffers() // lensed through the glass edge
  private readonly wy = this.buffers()
  private readonly ax = this.buffers() // scratch for the colour fringes
  private readonly ay = this.buffers()
  private readonly mx = this.buffers() // magnified under the capsule
  private readonly my = this.buffers()

  private buffers(): Float32Array[] {
    return this.strokes.map((s) => new Float32Array(s.xs.length))
  }

  paint(c: CanvasRenderingContext2D, scene: FieldScene): void {
    const { width: w, height: h } = scene
    c.clearRect(0, 0, w, h)
    if (!w || !h) return
    const col = scene.dark ? COLORS.dark : COLORS.light
    const alpha = scene.dark ? LOOK.alpha.dark : LOOK.alpha.light

    const rest = fieldOrcaPlacement(w, h)
    const { rise, tilt } = orcaSwim(scene.time, ORCA_VIEWBOX.height)
    const m = placementMatrix({ ...rest, y: rest.y + rise * rest.scale, angle: rest.angle + tilt })
    this.posed.update(this.strokes, m, (i) => orcaDrawn(i, scene.elapsed))

    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.lineWidth = LOOK.width
    const g = scene.glass
    if (!g) {
      this.stroke(c, this.posed.xs, this.posed.ys, col.ink, alpha)
      return
    }
    // Outside the glass: the orca as it is.
    c.save()
    c.beginPath()
    c.rect(0, 0, w, h)
    c.roundRect(g.x, g.y, g.w, g.h, g.r)
    c.clip('evenodd')
    this.stroke(c, this.posed.xs, this.posed.ys, col.ink, alpha)
    c.restore()
    this.throughGlass(c, g, col, alpha, scene.lens)
  }

  private throughGlass(c: CanvasRenderingContext2D, g: GlassRect, col: Palette, alpha: number, lens: LensView | null) {
    c.save()
    c.beginPath()
    c.roundRect(g.x, g.y, g.w, g.h, g.r)
    c.clip()
    this.lensAll(g, LENSING.edge, this.wx, this.wy)
    this.stroke(c, this.wx, this.wy, col.ink, alpha)

    // Colour fringes, only in the bending band: red bends a little more, blue a little less.
    const band = LENSING.band
    c.save()
    c.beginPath()
    c.roundRect(g.x, g.y, g.w, g.h, g.r)
    c.roundRect(g.x + band, g.y + band, Math.max(0, g.w - 2 * band), Math.max(0, g.h - 2 * band), Math.max(0, g.r - band))
    c.clip('evenodd')
    this.lensAll(g, LENSING.edge + LENSING.spread, this.ax, this.ay)
    this.stroke(c, this.ax, this.ay, col.red, alpha * FRINGE_ALPHA)
    this.lensAll(g, LENSING.edge - LENSING.spread, this.ax, this.ay)
    this.stroke(c, this.ax, this.ay, col.blue, alpha * FRINGE_ALPHA)
    c.restore()

    if (lens && lens.bandBottom > lens.bandTop) {
      // The capsule magnifies what the glass shows under it, instead of sampling the glass again;
      // the glows below the canvas show through unmagnified.
      const cx = lens.x + lens.w / 2
      const cy = lens.y + lens.h / 2
      const k = LENSING.magnify
      c.save()
      c.beginPath()
      c.rect(lens.x - 1, lens.bandTop, lens.w + 2, lens.bandBottom - lens.bandTop)
      c.clip()
      c.beginPath()
      c.roundRect(lens.x, lens.y, lens.w, lens.h, lens.r)
      c.clip()
      c.clearRect(lens.x, lens.y, lens.w, lens.h)
      const { counts } = this.posed
      for (let i = 0; i < counts.length; i++) {
        for (let p = 0; p < counts[i]; p++) {
          this.mx[i][p] = cx + (this.wx[i][p] - cx) * k
          this.my[i][p] = cy + (this.wy[i][p] - cy) * k
        }
      }
      this.stroke(c, this.mx, this.my, col.ink, alpha)
      c.restore()
    }
    c.restore()
  }

  private lensAll(g: GlassRect, k: number, outX: Float32Array[], outY: Float32Array[]) {
    const { xs, ys, counts } = this.posed
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) lensInto(xs[i], ys[i], 0, g, k, outX[i], outY[i], 0, counts[i] - 1)
    }
  }

  private stroke(c: CanvasRenderingContext2D, xs: Float32Array[], ys: Float32Array[], rgb: string, alpha: number) {
    c.strokeStyle = `rgb(${rgb} / ${alpha})`
    c.beginPath()
    traceLines(c, xs, ys, this.posed.counts)
    c.stroke()
  }
}
