/**
 * Line drawings as polylines: read from SVG path data or traced points, placed on the page by an
 * affine transform every frame and drawn on stroke by stroke. Polylines rather than Path2D so a
 * drawing can be bent point by point (the console glass lenses it at the sidebar edge, the cover
 * sea swells) and cut at any share of its length.
 */

export type Point = readonly [number, number]

export interface Stroke {
  /** Artwork coordinates. */
  readonly xs: Float32Array
  readonly ys: Float32Array
  /** Arc length from the first point to each point. */
  readonly along: Float32Array
  readonly length: number
}

export function strokeFromPoints(points: readonly Point[]): Stroke {
  const n = points.length
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  const along = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][0]
    ys[i] = points[i][1]
    if (i) along[i] = along[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
  }
  return { xs, ys, along, length: n ? along[n - 1] : 0 }
}

const PATH_TOKEN = /[MmLlHhVvCcSsZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g

/**
 * The subpaths of SVG path data (M L H V C S Z, absolute and relative) as polylines; each cubic
 * is split into `segments` pieces.
 */
export function polylinesFromPath(d: string, segments = 12): Point[][] {
  const tokens = d.match(PATH_TOKEN) ?? []
  const out: Point[][] = []
  let current: Point[] = []
  let i = 0
  let command = ''
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let control: Point | null = null
  const num = () => Number(tokens[i++])

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++]
    const relative = command === command.toLowerCase()
    const ox = relative ? x : 0
    const oy = relative ? y : 0
    switch (command.toUpperCase()) {
      case 'M': {
        if (current.length > 1) out.push(current)
        x = ox + num()
        y = oy + num()
        startX = x
        startY = y
        current = [[x, y]]
        command = relative ? 'l' : 'L' // further pairs are line-tos
        control = null
        break
      }
      case 'L':
        x = ox + num()
        y = oy + num()
        current.push([x, y])
        control = null
        break
      case 'H':
        x = ox + num()
        current.push([x, y])
        control = null
        break
      case 'V':
        y = oy + num()
        current.push([x, y])
        control = null
        break
      case 'C':
      case 'S': {
        const smooth = command.toUpperCase() === 'S'
        const c1: Point = smooth ? (control ? [2 * x - control[0], 2 * y - control[1]] : [x, y]) : [ox + num(), oy + num()]
        const c2: Point = [ox + num(), oy + num()]
        const end: Point = [ox + num(), oy + num()]
        for (let k = 1; k <= segments; k++) {
          const t = k / segments
          const u = 1 - t
          const a = u * u * u
          const b = 3 * u * u * t
          const c = 3 * u * t * t
          const e = t * t * t
          current.push([a * x + b * c1[0] + c * c2[0] + e * end[0], a * y + b * c1[1] + c * c2[1] + e * end[1]])
        }
        control = c2
        x = end[0]
        y = end[1]
        break
      }
      case 'Z':
        current.push([startX, startY])
        x = startX
        y = startY
        control = null
        break
      default:
        i++ // unsupported command: skip its argument
    }
  }
  if (current.length > 1) out.push(current)
  return out
}

/** A Catmull-Rom spline through `points`, sampled about every `step` units: smooths the corners of a traced line. */
export function smoothPolyline(points: readonly Point[], step: number): Point[] {
  if (points.length < 3) return [...points]
  const out: Point[] = []
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    const pieces = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
    for (let k = 0; k < pieces; k++) {
      const t = k / pieces
      const t2 = t * t
      const t3 = t2 * t
      const at = (j: 0 | 1) =>
        0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)
      out.push([at(0), at(1)])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** Artwork to page: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Placement {
  /** Page point the artwork's `anchor` lands on. */
  x: number
  y: number
  anchor: Point
  /** Page px per artwork unit. */
  scale: number
  /** Degrees, clockwise on the page. */
  angle: number
  /** Mirrors the artwork left to right about the anchor. */
  mirror?: boolean
}

export function placementMatrix({ x, y, anchor, scale, angle, mirror }: Placement): Affine {
  const r = (angle * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const sx = (mirror ? -1 : 1) * scale
  const a = cos * sx
  const b = sin * sx
  const c = -sin * scale
  const d = cos * scale
  return { a, b, c, d, e: x - (a * anchor[0] + c * anchor[1]), f: y - (b * anchor[0] + d * anchor[1]) }
}

export function applyAffine(m: Affine, x: number, y: number): Point {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

/**
 * Strokes placed on the page and drawn up to a share of their length, in reusable buffers:
 * stroke i occupies xs[i] / ys[i] up to counts[i] points.
 */
export class PosedLines {
  readonly xs: Float32Array[]
  readonly ys: Float32Array[]
  readonly counts: Int32Array

  constructor(strokes: readonly Stroke[]) {
    this.xs = strokes.map((s) => new Float32Array(s.xs.length))
    this.ys = strokes.map((s) => new Float32Array(s.xs.length))
    this.counts = new Int32Array(strokes.length)
  }

  /**
   * Places every stroke by `m`, drawn up to `drawn(i)` (0..1) of its length. `bend` offsets a
   * point vertically in artwork units before placing it (a swell moving through a sea line).
   */
  update(strokes: readonly Stroke[], m: Affine, drawn: (i: number) => number, bend?: (i: number, x: number, y: number) => number): void {
    strokes.forEach((s, i) => {
      const share = Math.min(1, Math.max(0, drawn(i)))
      const n = s.xs.length
      const xs = this.xs[i]
      const ys = this.ys[i]
      if (share <= 0 || n < 2) {
        this.counts[i] = 0
        return
      }
      const reach = share * s.length
      let count = 0
      const put = (x: number, y: number) => {
        const by = bend ? y + bend(i, x, y) : y
        xs[count] = m.a * x + m.c * by + m.e
        ys[count] = m.b * x + m.d * by + m.f
        count++
      }
      let k = 0
      for (; k < n && s.along[k] <= reach; k++) put(s.xs[k], s.ys[k])
      if (k < n) {
        // Cut inside segment k-1..k (k >= 1: the first point is at length 0). At most n points in all.
        const t = (reach - s.along[k - 1]) / (s.along[k] - s.along[k - 1] || 1)
        put(s.xs[k - 1] + (s.xs[k] - s.xs[k - 1]) * t, s.ys[k - 1] + (s.ys[k] - s.ys[k - 1]) * t)
      }
      this.counts[i] = count
    })
  }
}

/** Adds the drawn part of the given lines (all by default) to the current path as subpaths. */
export function traceLines(
  ctx: CanvasRenderingContext2D,
  xs: readonly Float32Array[],
  ys: readonly Float32Array[],
  counts: ArrayLike<number>,
  only?: readonly number[],
): void {
  const trace = (i: number) => {
    const n = counts[i]
    if (n < 2) return
    ctx.moveTo(xs[i][0], ys[i][0])
    for (let k = 1; k < n; k++) ctx.lineTo(xs[i][k], ys[i][k])
  }
  if (only) only.forEach(trace)
  else for (let i = 0; i < xs.length; i++) trace(i)
}

/** Cubic ease-out of a share, clamped to 0..1. */
export function easeOut(share: number): number {
  const t = Math.min(1, Math.max(0, share))
  return 1 - Math.pow(1 - t, 3)
}
