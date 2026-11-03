import { PosedLines, applyAffine, placementMatrix, traceLines, type Affine, type Stroke } from '@/components/common/lineArt/lineFigure'
import { ORCA_VIEWBOX, orcaStrokes } from '@/components/common/lineArt/orcaArt'
import { orcaDrawn, orcaSwim, ORCA_DRAW } from '@/components/common/lineArt/orcaMotion'
import { coverComposition, type CoverComposition } from './coverComposition'
import { GlassWordmark } from './glassWordmark'
import { ORCA_FROM, sprayAt, swell, waveDrawn } from './seaWave'
import { waveLines } from './waveArt'

/** 'r g b' channel strings, read from the page's CSS variables. */
export interface Palette {
  ink: string
  frost: string
  shade: string
  sheen: number
}

/** Where the stage wants the wordmark, in CSS px. */
export interface StageMetrics {
  width: number
  height: number
  dpr: number
  gateY: number
  /** Largest wordmark size; it shrinks to fit the width. */
  fontSize: number
  /** Highest point the picture may reach (clear of the header and the kicker line). */
  artTop: number
}

const WORDMARK_MAX_WIDTH = 0.74 // share of the width the wordmark may span
const LENS = 1.32 // vertical magnification seen through the glass letters
const SOFTEN = 1.6 // seen through the frost: wider, fainter lines
const LOOK = {
  orca: { alpha: 0.86, width: 2.1 },
  wave: { alpha: 0.58, width: 1.6 },
  spray: 0.55,
} as const
/** The spray starts once most of the orca's outline is out of the water. */
const SPRAY_FROM = ORCA_FROM + ORCA_DRAW.outline * 0.8
const FAR = 1e5 // px: the water's surface runs on this far beyond its ends

/**
 * Canvas 2D renderer of the cover: a line-drawn orca leaping out of a breaking wave at the
 * wordmark's lower right, behind the frosted glass letters, the swells running on under them.
 * The orca shows above the water only, so its tail stays in the sea it leaves. The paper itself is
 * CSS behind the canvas, so frames clear to transparent.
 */
export class CoverScene {
  private wordmark: GlassWordmark
  private readonly orca = orcaStrokes()
  private readonly wave = waveLines()
  private readonly waveStrokes = this.wave.map((line) => line.stroke)
  private readonly allLines = this.wave.map((_, i) => i)
  /** The water's surface around the leap: the top swell at the wave's foot and its reach to the left. */
  private readonly waterLines: readonly number[]
  private readonly waterStrokes: readonly Stroke[]
  private readonly posedOrca = new PosedLines(this.orca)
  private readonly posedWave = new PosedLines(this.waveStrokes)
  private readonly posedWater: PosedLines
  private readonly crestAndSea: number[]
  private readonly reaches: number[]
  private composition: CoverComposition | null = null
  private waveMatrix: Affine | null = null
  private size: { width: number; height: number; dpr: number; gateY: number } | null = null
  private settled = false

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private palette: Palette,
    private readonly wordmarkText: string,
    private readonly fontFamily: string,
  ) {
    this.wordmark = this.makeWordmark()
    const kinds = this.wave.map((line) => line.kind)
    this.reaches = kinds.flatMap((kind, i) => (kind === 'reach' ? [i] : []))
    this.crestAndSea = kinds.flatMap((kind, i) => (kind === 'reach' ? [] : [i]))
    const lowestSeas = kinds.flatMap((kind, i) => (kind === 'sea' ? [i] : [])).slice(-3)
    this.waterLines = [this.reaches[0], lowestSeas[0]] // the reach (drawn from the swell's left end), then the swell
    this.waterStrokes = this.waterLines.map((i) => this.waveStrokes[i])
    this.posedWater = new PosedLines(this.waterStrokes)
  }

  static create(canvas: HTMLCanvasElement, palette: Palette, wordmarkText: string, fontFamily: string): CoverScene | null {
    const ctx = canvas.getContext('2d')
    return ctx ? new CoverScene(canvas, ctx, palette, wordmarkText, fontFamily) : null
  }

  private makeWordmark(): GlassWordmark {
    const { ink, frost, shade, sheen } = this.palette
    return new GlassWordmark(this.wordmarkText, { family: this.fontFamily, weight: 800, tracking: -0.045, ink, frost, shade, sheen })
  }

  /** Takes a new palette (the theme changed); lay out again to rebuild the wordmark. */
  setPalette(palette: Palette): void {
    this.palette = palette
    this.wordmark = this.makeWordmark()
  }

  /** Lays the wordmark out centred at `gateY` and the picture around it. */
  resize({ width, height, dpr, gateY, fontSize: maxFontSize, artTop }: StageMetrics): void {
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    const fontSize = this.wordmark.fitSize(maxFontSize, width * WORDMARK_MAX_WIDTH)
    this.wordmark.layout(width / 2, gateY, fontSize, dpr)
    const box = this.wordmark.bounds
    this.composition = box ? coverComposition(box, fontSize, width, artTop, this.orca) : null
    this.waveMatrix = this.composition ? placementMatrix(this.composition.wave) : null
    this.size = { width, height, dpr, gateY }
  }

  /** A still cover: the drawing shows finished and holds where it is. */
  settle(): void {
    this.settled = true
  }

  /** Draws the frame `time` s after the stage started. */
  render(time: number): void {
    const { ctx, size, composition, waveMatrix } = this
    if (!size || !composition || !waveMatrix) return
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const elapsed = this.settled ? Infinity : time

    const drawn = waveDrawn(this.wave, elapsed)
    const bend = (lines: readonly number[]) => (i: number, x: number) => swell(this.wave[lines[i]].kind, lines[i], x, time)
    this.posedWave.update(this.waveStrokes, waveMatrix, (i) => drawn[i], bend(this.allLines))
    this.posedWater.update(this.waterStrokes, waveMatrix, () => 1, bend(this.waterLines))

    const { rise, tilt } = orcaSwim(time, ORCA_VIEWBOX.height)
    const leap = composition.orca
    const orcaMatrix = placementMatrix({ ...leap, y: leap.y + rise * leap.scale, angle: leap.angle + tilt })
    this.posedOrca.update(this.orca, orcaMatrix, (i) => orcaDrawn(i, elapsed - ORCA_FROM))

    this.wordmark.drawShadow(ctx)
    this.drawPicture(ctx, 1)
    this.wordmark.draw(ctx, time, (inside) => {
      // Lens: what lies behind the letters appears magnified about the gate line; the frost blur comes after.
      inside.translate(0, size.gateY)
      inside.scale(1, LENS)
      inside.translate(0, -size.gateY)
      inside.lineCap = 'round'
      inside.lineJoin = 'round'
      this.drawPicture(inside, SOFTEN)
    })
    this.drawSpray(ctx, waveMatrix, time, elapsed - SPRAY_FROM)
  }

  /** The wave, then the orca above the water. `soften` > 1 draws wider, fainter lines. */
  private drawPicture(ctx: CanvasRenderingContext2D, soften: number): void {
    const { palette, posedWave: wave, posedOrca: orca } = this
    ctx.lineWidth = LOOK.wave.width * soften
    ctx.strokeStyle = `rgb(${palette.ink} / ${LOOK.wave.alpha / soften})`
    ctx.beginPath()
    traceLines(ctx, wave.xs, wave.ys, wave.counts, this.crestAndSea)
    ctx.stroke()
    // The swells running on to the left fade out as they go.
    for (const i of this.reaches) {
      const n = wave.counts[i]
      if (n < 2) continue
      const fade = ctx.createLinearGradient(wave.xs[i][0], wave.ys[i][0], wave.xs[i][n - 1], wave.ys[i][n - 1])
      fade.addColorStop(0, `rgb(${palette.ink} / ${LOOK.wave.alpha / soften})`)
      fade.addColorStop(1, `rgb(${palette.ink} / 0)`)
      ctx.strokeStyle = fade
      ctx.beginPath()
      traceLines(ctx, wave.xs, wave.ys, wave.counts, [i])
      ctx.stroke()
    }

    ctx.save()
    this.clipAboveWater(ctx)
    ctx.lineWidth = LOOK.orca.width * soften
    ctx.strokeStyle = `rgb(${palette.ink} / ${LOOK.orca.alpha / soften})`
    ctx.beginPath()
    traceLines(ctx, orca.xs, orca.ys, orca.counts)
    ctx.stroke()
    ctx.restore()
  }

  /** Clips to the air: everything above the water's surface (the reach from its far end, then the swell). */
  private clipAboveWater(ctx: CanvasRenderingContext2D): void {
    const { xs, ys, counts } = this.posedWater
    const [reach, sea] = [0, 1]
    const far = counts[reach] - 1
    const last = counts[sea] - 1
    if (far < 1 || last < 1) return
    ctx.beginPath()
    ctx.moveTo(xs[reach][far] - FAR, ys[reach][far])
    for (let k = far; k >= 0; k--) ctx.lineTo(xs[reach][k], ys[reach][k])
    for (let k = 0; k <= last; k++) ctx.lineTo(xs[sea][k], ys[sea][k])
    ctx.lineTo(xs[sea][last] + FAR, ys[sea][last])
    ctx.lineTo(xs[sea][last] + FAR, -FAR)
    ctx.lineTo(xs[reach][far] - FAR, -FAR)
    ctx.closePath()
    ctx.clip()
  }

  private drawSpray(ctx: CanvasRenderingContext2D, m: Affine, time: number, shown: number): void {
    const { ink } = this.palette
    for (const drop of sprayAt(time, shown)) {
      const [x, y] = applyAffine(m, drop.x, drop.y)
      ctx.fillStyle = `rgb(${ink} / ${drop.alpha * LOOK.spray})`
      ctx.beginPath()
      ctx.arc(x, y, drop.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
