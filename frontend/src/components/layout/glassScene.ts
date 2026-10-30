import type { GlassRect } from './glassOptics'

/** The sidebar's selection capsule as the field must draw it. */
export interface LensView extends GlassRect {
  /** Visible band of the scrolling nav (viewport px); the capsule is clipped to it. */
  bandTop: number
  bandBottom: number
}

/**
 * What the field canvas draws through. The capsule that sits over the field registers how to read
 * its current box (`lens`, read on every draw) and tells the field to redraw when it moves; the
 * field registers how to be told (`invalidate`).
 */
export const glassScene: { lens: (() => LensView | null) | null; invalidate: () => void } = {
  lens: null,
  invalidate: () => {},
}
