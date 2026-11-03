import { easeOut } from './lineFigure'

/**
 * How the orca comes alive, on the cover and in the console alike: drawn on slowly, the body
 * outline first and the details one after another while it closes, then swimming in place with
 * a slow rise and tilt.
 */
export const ORCA_DRAW = {
  /** s to draw the body outline. */
  outline: 3.4,
  /** s to draw each detail. */
  detail: 1.5,
  /** Share of the outline drawn before the first detail starts. */
  detailsFrom: 0.55,
  /** s between the starts of consecutive details. */
  stagger: 0.32,
} as const

export const ORCA_SWIM = {
  /** s per swim cycle. */
  period: 6.5,
  /** Rise as a share of the artwork height. */
  rise: 0.035,
  /** Tilt, degrees. */
  tilt: 1.4,
} as const

/** Share (0..1, eased) of orca stroke `index` drawn `elapsed` s after the drawing started. */
export function orcaDrawn(index: number, elapsed: number): number {
  if (index === 0) return easeOut(elapsed / ORCA_DRAW.outline)
  const start = ORCA_DRAW.outline * ORCA_DRAW.detailsFrom + (index - 1) * ORCA_DRAW.stagger
  return easeOut((elapsed - start) / ORCA_DRAW.detail)
}

/** s until a drawing of `strokes` strokes is complete. */
export function orcaDrawSeconds(strokes: number): number {
  return Math.max(ORCA_DRAW.outline, ORCA_DRAW.outline * ORCA_DRAW.detailsFrom + (strokes - 2) * ORCA_DRAW.stagger + ORCA_DRAW.detail)
}

/** The swim at `time` s: rise in artwork units (up is negative) and tilt in degrees. */
export function orcaSwim(time: number, artHeight: number): { rise: number; tilt: number } {
  const swing = Math.sin((time / ORCA_SWIM.period) * Math.PI * 2)
  return { rise: -swing * ORCA_SWIM.rise * artHeight, tilt: swing * ORCA_SWIM.tilt }
}
