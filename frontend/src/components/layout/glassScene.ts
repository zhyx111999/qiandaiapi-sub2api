import type { GlassRect } from './glassOptics'

/** The selection capsule as the field must draw it this frame. */
export interface LensView extends GlassRect {
  /** Visible band of the scrolling nav (viewport px); the capsule is clipped to it. */
  bandTop: number
  bandBottom: number
}

/**
 * What the field draws through, shared between the selection capsule (which publishes its box
 * every frame it moves) and the field (which redraws when told the capsule moved).
 */
export const glassScene: { lens: LensView | null; invalidate: () => void } = {
  lens: null,
  invalidate: () => {},
}
