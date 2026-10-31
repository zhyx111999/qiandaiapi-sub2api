import type { GlassRect } from './glassOptics'

/** The sidebar's selection capsule as the field must draw it. */
export interface LensView extends GlassRect {
  /** Visible band of the scrolling nav (viewport px); the capsule is clipped to it. */
  bandTop: number
  bandBottom: number
}

/** What the field canvas of one console layout draws through. */
export interface GlassScene {
  /** The capsule over the field registers how to read its current box. */
  setLens(read: (() => LensView | null) | null): void
  /** Its box this frame (read on every draw), or null. */
  lens(): LensView | null
  /** The field registers how to redraw. */
  onInvalidate(redraw: () => void): void
  /** The capsule moved: redraw now. */
  invalidate(): void
}

/** AppLayout creates one and hands it to its field (ConsoleBackdrop) and its sidebar. */
export function createGlassScene(): GlassScene {
  let read: (() => LensView | null) | null = null
  let redraw = () => {}
  return {
    setLens: (next) => {
      read = next
    },
    lens: () => read?.() ?? null,
    onInvalidate: (next) => {
      redraw = next
    },
    invalidate: () => redraw(),
  }
}
