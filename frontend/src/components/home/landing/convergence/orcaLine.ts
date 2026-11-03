/**
 * The cover's line-drawn orca, swimming over the strands just above the wordmark.
 *
 * Artwork: "the orca" by cactus_cowboy, Openclipart #287994, released into the public domain
 * (CC0 1.0). Its paths are drawn as strokes only (a line drawing); the body is filled with the
 * paper colour so the strands passing behind it stay behind it.
 */

/** Size of the artwork's coordinate space. */
export const ORCA_VIEWBOX = { width: 611, height: 309.375 } as const

/** Body outline, then the details drawn over it. */
const BODY =
  'M109.384,193.297c0,0-16.916,25.385-35.166,27.923c-18.517,2.714-40.841-3.851-48.609,0c-7.99,4.027-15.868,6.653-19.651,12.41c6.407,0.809,9.036-5.757,13.446,1.035c3.47,6.343,10.035,10.281,17.583,11.376c8.21,1.527,0.328,5.471,5.17,7.242c5.667,0.854,20.108,2.167,22.755,15.513c2.607,12.92,3.102,12.41,3.102,12.41s-4.433,18.892-12.411,22.755c6.662,1.389,36.866,4.015,42.404-23.786c4.968-27.35-9.478-35.229,4.137-43.439c12.648-7.549,75.036-32.521,109.633-41.372c18.623-5.286,45.981-9.558,79.638-9.31c42.41,1.317,91.922,18.151,144.797,13.446c43.347-4.747,176.921,3.426,163.412-7.238c13.509-7.723,3.88-34.842-14.481-55.85C567.83,116.258,457.527,88.68,441.384,84.699c-6.11-1.583-31.13-61.679-54.819-77.57c0,0-20.957-6.43-5.172,22.755c5.223,2.332,32.232,55.151-27.923,53.779C284.921,82.49,169.295,92.468,109.384,193.297z'
const DETAILS = [
  // pectoral fin
  'M506.538,198.465c-3.051,5.773-14.985,21.518-24.821,25.856c-19.021,7.369-25.545,7.003-31.028,5.172c-3.628-0.53-1.04-6.872,0-9.309c0.273-2.815,12.091-19.229,17.583-24.821C474.601,190.448,506.538,198.465,506.538,198.465z',
  // flank patch
  'M336.922,191.226c-76.277-11.206-131.353,5.173-131.353,5.173c4.806-5.904,85.015-42.518,162.382-43.439c35.254-1.106,13.791,45.46,9.305,44.475C363.654,195.468,349.683,192.982,336.922,191.226z',
  // eye patch
  'M501.37,151.924c26.379-17.995,60.728-14.915,58.952-1.031c-1.027,11.325-19.098,13.951-28.959,13.442C519.904,164.844,477.879,168.126,501.37,151.924z',
  // chin
  'M426.902,199.5c17.873-11.737,16.573-34.656,77.569-25.856c12.402,1.46,120.13,17.385,89.98,22.755c-41.722,7.18-43.296,5.214-101.355,6.207L426.902,199.5z',
  // saddle line
  'M491.026,161.234c-3.296,3.61-24.308,10.176-33.095,10.344c-9.596-0.168-60.155,20.844-69.296,33.095c-9.242,12.697-5.96,17.292-4.138,20.685c2.117,3.173,54.643-5.357,66.19-13.446c10.778-7.672,31.786-18.176,36.2-23.786c4.777-6.207,11.376-14.48,11.376-14.48',
] as const

const DRAW_SECONDS = 2.4 // the line drawing comes in stroke by stroke
const STAGGER = 0.28 // s between the start of consecutive strokes
const LINE_PX = 2.1 // stroke width on screen
const BOB = { period: 6.5, rise: 0.035, tilt: 1.4 } // slow swim: rise as a fraction of the height, tilt in degrees

export interface OrcaPlacement {
  /** Centre of the artwork on the page. */
  x: number
  y: number
  /** Page px per artwork unit. */
  scale: number
}

const MIN_HEIGHT = 48 // px: below this there is no room for the orca and it is left out

/**
 * Centred over the wordmark, a little narrower than half of it, its belly a gap above the letters;
 * never wider than a third of the viewport. On short screens it shrinks to the room between
 * `minTop` and the letters, and is left out (null) when that room is too small.
 */
export function orcaPlacement(
  wordmark: { x: number; width: number; top: number },
  fontSize: number,
  viewportWidth: number,
  minTop: number,
): OrcaPlacement | null {
  const bottom = wordmark.top - fontSize * 0.22
  const wanted = Math.min(wordmark.width * 0.46, viewportWidth * 0.34) * (ORCA_VIEWBOX.height / ORCA_VIEWBOX.width)
  const height = Math.min(wanted, bottom - minTop)
  if (height < MIN_HEIGHT) return null
  return { x: wordmark.x + wordmark.width / 2, y: bottom - height / 2, scale: height / ORCA_VIEWBOX.height }
}

/** Share of stroke `index` drawn `elapsed` seconds after the drawing started (0..1, eased). */
export function strokeProgress(elapsed: number, index: number): number {
  const t = Math.min(1, Math.max(0, (elapsed - index * STAGGER) / (DRAW_SECONDS - STAGGER * DETAILS.length)))
  return 1 - Math.pow(1 - t, 3)
}

export class OrcaLine {
  private readonly body = new Path2D(BODY)
  private readonly details = DETAILS.map((d) => new Path2D(d))
  private readonly lengths: number[]
  private placement: OrcaPlacement | null = null
  private started: number | null = null
  private settled = false

  constructor(private readonly ink: string, private readonly paper: string) {
    this.lengths = [BODY, ...DETAILS].map(pathLength)
  }

  place(placement: OrcaPlacement | null): void {
    this.placement = placement
  }

  /** Show the finished drawing at once (still cover: reduced motion or a device that steps down). */
  settle(): void {
    this.settled = true
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const p = this.placement
    if (!p) return
    if (this.started === null) this.started = time
    const elapsed = this.settled ? Infinity : time - this.started
    const swim = this.settled ? 0 : Math.sin((time / BOB.period) * Math.PI * 2)
    const rise = swim * BOB.rise * ORCA_VIEWBOX.height * p.scale

    ctx.save()
    ctx.translate(p.x, p.y + rise)
    ctx.rotate((swim * BOB.tilt * Math.PI) / 180)
    ctx.scale(p.scale, p.scale)
    ctx.translate(-ORCA_VIEWBOX.width / 2, -ORCA_VIEWBOX.height / 2)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = LINE_PX / p.scale

    // The paper fills in as the outline closes, hiding the strands behind the body.
    const outline = strokeProgress(elapsed, 0)
    ctx.fillStyle = `rgb(${this.paper} / ${0.94 * outline})`
    ctx.fill(this.body)
    ;[this.body, ...this.details].forEach((path, i) => {
      const progress = strokeProgress(elapsed, i)
      if (progress <= 0) return
      const length = this.lengths[i]
      ctx.setLineDash(progress >= 1 ? [] : [length * progress, length])
      ctx.strokeStyle = `rgb(${this.ink} / 0.86)`
      ctx.stroke(path)
    })
    ctx.restore()
  }
}

/** Length of an SVG path in its own units (for drawing it on); a generous guess where it cannot be measured. */
const UNMEASURED = 2000
function pathLength(d: string): number {
  if (typeof document === 'undefined') return UNMEASURED
  try {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    const length = path.getTotalLength()
    return length > 0 ? length : UNMEASURED
  } catch {
    return UNMEASURED
  }
}
