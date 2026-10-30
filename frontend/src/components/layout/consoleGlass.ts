/**
 * Liquid-glass settings of the console. From lg up the sidebar floats beside the workspace over
 * the flowing field; below that it is a floating glass drawer, and the field runs behind it while
 * it is open. The sidebar and the selection capsule are lensed inside the field canvas
 * (glassOptics / fieldPainter); only the toolbar, which page content scrolls under, samples live.
 */
export const DESKTOP_MIN_WIDTH = 1024

/** Glass behind the top bar's controls: one pass, no dispersion (it only re-samples on scroll). */
export const TOOLBAR_GLASS = { scale: 19, aberration: 0, mode: 'symmetric', edge: 12 } as const
