/**
 * Optics of the console glass, drawn inside the field canvas instead of sampled live by a
 * backdrop filter ("glass cannot sample glass": one pass for the whole scene). A rounded rect
 * lenses the field near its edge the way the SVG displacement map does: the bending band shows a
 * compressed view that reaches a little past the edge.
 */
export interface GlassRect {
  x: number
  y: number
  w: number
  h: number
  r: number
}

export const LENSING = {
  /** Displacement at the very edge, px: the edge shows what lies this far outside. */
  edge: 20,
  /** Width of the bending band, px. */
  band: 34,
  /** Red bends this much more and blue this much less, px (edge dispersion). */
  spread: 3,
  /** Magnification under the selection capsule. */
  magnify: 1.14,
} as const

/** Signed distance to a rounded rect, negative inside. */
export function rrSdf(x: number, y: number, g: GlassRect): number {
  const qx = Math.abs(x - g.x - g.w / 2) - (g.w / 2 - g.r)
  const qy = Math.abs(y - g.y - g.h / 2) - (g.h / 2 - g.r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - g.r
}

/**
 * Screen depth (px inside the edge) at which backdrop depth `sq` appears. The map samples
 * depth s - k·(1 - s/band)² at screen depth s; this is its inverse, in closed form. Beyond the
 * band nothing moves; further than k outside, points stay outside (clipped away).
 */
export function lensDepth(sq: number, k: number, band: number): number {
  if (sq >= band) return sq
  if (sq < -k) return sq + k
  const u = (-band + Math.sqrt(band * band + 4 * k * (band - sq))) / (2 * k)
  return band * (1 - u)
}

/**
 * Lenses polyline points through `g`: column c sits at x = c·step (or `xs[c]`), y = `ys[c]`.
 * Writes columns c0..c1 into outX/outY; points away from the edge are copied unchanged.
 */
export function lensInto(
  xs: Float32Array | null,
  ys: Float32Array,
  step: number,
  g: GlassRect,
  k: number,
  outX: Float32Array,
  outY: Float32Array,
  c0: number,
  c1: number,
): void {
  const band = LENSING.band
  const reach = k + 2
  for (let c = c0; c <= c1; c++) {
    const qx = xs ? xs[c] : c * step
    const qy = ys[c]
    outX[c] = qx
    outY[c] = qy
    if (qx < g.x - reach || qx > g.x + g.w + reach || qy < g.y - reach || qy > g.y + g.h + reach) continue
    const sq = -rrSdf(qx, qy, g)
    if (sq >= band) continue
    const delta = lensDepth(sq, k, band) - sq
    const gx = rrSdf(qx + 0.5, qy, g) - rrSdf(qx - 0.5, qy, g)
    const gy = rrSdf(qx, qy + 0.5, g) - rrSdf(qx, qy - 0.5, g)
    const len = Math.hypot(gx, gy) || 1
    outX[c] = qx - (gx / len) * delta
    outY[c] = qy - (gy / len) * delta
  }
}
