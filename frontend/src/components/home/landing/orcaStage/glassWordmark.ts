/**
 * The wordmark as frosted glass letters lying over the cover's picture (the orca and the wave).
 *
 * Inside the letters the scene is re-painted magnified (lens) onto a scratch
 * layer, blurred once onto the glass layer (frost), then clipped to the glyphs
 * with a cached text mask; a cached rim and a soft cast shadow give the letters
 * their volume. Per-frame work stays on two offscreen canvases the size of the wordmark.
 */

export interface WordmarkBox {
  x: number
  y: number
  width: number
  height: number
  /** Glyph extents in page coordinates: left and right edges, and the letter band (ascender top to descender bottom). */
  left: number
  right: number
  top: number
  bottom: number
}

export interface WordmarkStyle {
  family: string
  weight: number
  /** Letter spacing in em. */
  tracking: number
  /** 'r g b' channels: letter edge, frost, and the shadows' colour. */
  ink: string
  frost: string
  shade: string
  /** Strength of the highlights (body light and light sweep), 1 on ivory paper. */
  sheen: number
}

const SHEEN_PERIOD = 8 // s between light sweeps
const SHEEN_DURATION = 1.8 // s
const FROST = 0.035 // blur radius as a fraction of the font size

/**
 * The font size, at most `maxSize`, at which text measuring `widthAtSize` px at `size` spans at most
 * `maxWidth` px. Glyph widths and the em-based tracking both scale with the size.
 */
export function fitFontSize(widthAtSize: number, size: number, maxWidth: number, maxSize: number): number {
  if (widthAtSize <= 0 || size <= 0) return maxSize
  return Math.min(maxSize, (size * maxWidth) / widthAtSize)
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  return ctx ? [canvas, ctx] : null
}

export class GlassWordmark {
  private box: WordmarkBox | null = null
  private dpr = 1
  private fontSize = 0
  private glass: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null
  private inner: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null
  private mask: HTMLCanvasElement | null = null
  private rim: HTMLCanvasElement | null = null
  private shadow: HTMLCanvasElement | null = null

  constructor(
    private readonly text: string,
    private readonly style: WordmarkStyle,
  ) {}

  get bounds(): WordmarkBox | null {
    return this.box
  }

  private font(size: number): string {
    return `${this.style.weight} ${size}px ${this.style.family}`
  }

  /** Sets font and spacing on `ctx` and returns the alphabetic baseline that centres the glyphs on `centerY`. */
  private applyText(ctx: CanvasRenderingContext2D, centerY: number): number {
    ctx.font = this.font(this.fontSize)
    ctx.letterSpacing = `${this.style.tracking * this.fontSize}px`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const metrics = ctx.measureText(this.text)
    return centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
  }

  /** The largest size up to `maxSize` at which the wordmark fits in `maxWidth` px (any brand length). */
  fitSize(maxSize: number, maxWidth: number): number {
    const probe = canvas2d(1, 1)
    if (!probe) return maxSize
    const [, measure] = probe
    measure.font = this.font(maxSize)
    measure.letterSpacing = `${this.style.tracking * maxSize}px`
    const metrics = measure.measureText(this.text)
    return fitFontSize(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, maxSize, maxWidth, maxSize)
  }

  /** Rebuilds the cached layers; call on resize and once web fonts have loaded. */
  layout(centerX: number, centerY: number, fontSize: number, dpr: number): void {
    this.fontSize = fontSize
    this.dpr = dpr

    const probe = canvas2d(1, 1)
    if (!probe) return
    const [, measure] = probe
    const baseline = this.applyText(measure, centerY)
    const metrics = measure.measureText(this.text)
    const pad = fontSize * 0.4
    const left = centerX - metrics.actualBoundingBoxLeft
    const right = centerX + metrics.actualBoundingBoxRight
    const top = baseline - metrics.actualBoundingBoxAscent
    const bottom = baseline + metrics.actualBoundingBoxDescent
    const box = { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2, left, right, top, bottom }
    this.box = box

    const make = () => {
      const layer = canvas2d(box.width * dpr, box.height * dpr)
      if (!layer) return null
      const [, ctx] = layer
      ctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr)
      this.applyText(ctx, centerY)
      return layer
    }

    const mask = make()
    const rim = make()
    const shadow = make()
    this.glass = make()
    this.inner = make()
    if (!mask || !rim || !shadow || !this.glass || !this.inner) return

    mask[1].fillText(this.text, centerX, baseline)
    this.mask = mask[0]

    // Rim: a bright top-left highlight and a faint ink edge bottom-right.
    const [, r] = rim
    r.lineJoin = 'round'
    r.lineWidth = Math.max(1.1, fontSize * 0.007)
    r.strokeStyle = 'rgb(255 255 255 / 0.95)'
    r.strokeText(this.text, centerX - 0.6, baseline - 0.8)
    r.lineWidth = 1
    r.strokeStyle = `rgb(${this.style.shade} / 0.2)`
    r.strokeText(this.text, centerX + 0.5, baseline + 0.9)
    this.rim = rim[0]

    // Cast shadow only: fill with a shadow, then cut the glyphs back out. Shadow
    // offsets ignore the transform, so they are given in device pixels.
    const [, s] = shadow
    s.shadowColor = `rgb(${this.style.shade} / 0.14)`
    s.shadowBlur = fontSize * 0.16 * dpr
    s.shadowOffsetY = fontSize * 0.09 * dpr
    s.fillText(this.text, centerX, baseline)
    s.shadowColor = 'transparent'
    s.globalCompositeOperation = 'destination-out'
    s.fillText(this.text, centerX, baseline)
    this.shadow = shadow[0]
  }

  drawShadow(ctx: CanvasRenderingContext2D): void {
    if (this.box && this.shadow) ctx.drawImage(this.shadow, this.box.x, this.box.y, this.box.width, this.box.height)
  }

  /**
   * Draws the glass letters. `paintInside` receives a context in page
   * coordinates and repaints whatever should show through the frost.
   */
  draw(ctx: CanvasRenderingContext2D, time: number, paintInside: (inside: CanvasRenderingContext2D) => void): void {
    const { box, glass, inner, mask, rim, dpr } = this
    if (!box || !glass || !inner || !mask || !rim) return
    const [canvas, g] = glass
    const [innerCanvas, i] = inner
    const toPage = [dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr] as const

    i.setTransform(1, 0, 0, 1, 0, 0)
    i.clearRect(0, 0, innerCanvas.width, innerCanvas.height)
    i.setTransform(...toPage)
    i.save()
    paintInside(i)
    i.restore()

    g.globalCompositeOperation = 'source-over'
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = `rgb(${this.style.frost} / 0.6)`
    g.fillRect(0, 0, canvas.width, canvas.height)
    // Frost: one blur pass over the whole interior. Engines without canvas filters
    // ignore it and keep the softened lines painted by the caller.
    g.filter = `blur(${this.fontSize * FROST * dpr}px)`
    g.drawImage(innerCanvas, 0, 0)
    g.filter = 'none'
    g.setTransform(...toPage)

    // Body light: brighter at the top of the letters, a breath of ink at the foot.
    const body = g.createLinearGradient(0, box.top, 0, box.bottom)
    body.addColorStop(0, `rgb(255 255 255 / ${0.5 * this.style.sheen})`)
    body.addColorStop(0.45, 'rgb(255 255 255 / 0)')
    body.addColorStop(1, `rgb(${this.style.shade} / 0.06)`)
    g.fillStyle = body
    g.fillRect(box.x, box.top, box.width, box.bottom - box.top)

    this.paintSheen(g, box, time)

    g.globalCompositeOperation = 'destination-in'
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(mask, 0, 0)

    ctx.drawImage(canvas, box.x, box.y, box.width, box.height)
    ctx.drawImage(rim, box.x, box.y, box.width, box.height)
  }

  private paintSheen(g: CanvasRenderingContext2D, box: WordmarkBox, time: number): void {
    const progress = (time % SHEEN_PERIOD) / SHEEN_DURATION
    if (progress >= 1) return
    const band = this.fontSize * 0.9
    const x = box.x - band + (box.width + band * 2) * progress
    g.save()
    g.translate(x, box.top)
    g.transform(1, 0, -0.35, 1, 0, 0)
    const light = g.createLinearGradient(-band / 2, 0, band / 2, 0)
    light.addColorStop(0, 'rgb(255 255 255 / 0)')
    light.addColorStop(0.5, `rgb(255 255 255 / ${0.7 * this.style.sheen})`)
    light.addColorStop(1, 'rgb(255 255 255 / 0)')
    g.fillStyle = light
    g.fillRect(-band / 2, 0, band, box.bottom - box.top)
    g.restore()
  }
}
