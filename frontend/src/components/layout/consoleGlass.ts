/**
 * Liquid-glass settings of the console in one place. From lg up the sidebar floats beside the
 * workspace over the flowing field; below that it is a floating glass drawer, and the field runs
 * behind it while it is open.
 */
export const DESKTOP_MIN_WIDTH = 1024

/** Floating sidebar / phone drawer: refraction round every edge. */
export const SIDEBAR_GLASS = { scale: 48, aberration: 2.5, mode: 'symmetric', edge: 40 } as const
/** Selection capsule over the active sidebar item. */
export const LENS_GLASS = { scale: 24, aberration: 3, mode: 'symmetric', edge: 14 } as const
/** Glass behind the top bar's controls. */
export const TOOLBAR_GLASS = { scale: 19, aberration: 2.5, mode: 'symmetric', edge: 12 } as const
