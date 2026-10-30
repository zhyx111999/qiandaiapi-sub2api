/**
 * Liquid-glass settings of the console in one place. The glass is desktop only: from lg up the
 * sidebar floats over the flowing field; below that (phones, small tablets) every surface is plain
 * and solid and no refraction is computed.
 */
export const DESKTOP_MIN_WIDTH = 1024
export const DESKTOP_MEDIA = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

/** Floating sidebar: refraction round every edge. */
export const SIDEBAR_GLASS = { scale: 48, aberration: 2.5, mode: 'symmetric', edge: 40, media: DESKTOP_MEDIA } as const
/** Selection capsule over the active sidebar item. */
export const LENS_GLASS = { scale: 24, aberration: 3, mode: 'symmetric', edge: 14, media: DESKTOP_MEDIA } as const
/** Glass behind the top bar's controls. */
export const TOOLBAR_GLASS = { scale: 19, aberration: 2.5, mode: 'symmetric', edge: 12, media: DESKTOP_MEDIA } as const
