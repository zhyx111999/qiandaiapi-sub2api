/**
 * Geometry of the "many threads, one gateway" field. Every strand is a function
 * y(x): it enters from the left at its own height with a slow travelling wave,
 * eases into its lane of a narrow band before the gateway (the wordmark), runs
 * flat through it, and leaves to the right as a calm, slightly widening ribbon.
 * Strands keep their top-to-bottom order everywhere, so they never cross.
 */

export interface StrandLayout {
  width: number
  height: number
  /** Vertical span the strands fan over at the left edge, in px. */
  fanTop: number
  fanBottom: number
  gateY: number
  /** x where every strand has reached its lane. */
  entryX: number
  /** x where the ribbon starts to widen again. */
  exitX: number
  /** Half-height of the band through the gateway. */
  waist: number
}

export interface Strand {
  /** Entry height within the fan, 0 (top) to 1 (bottom). */
  start: number
  /** Position inside the band, -1 (top) to 1 (bottom). */
  lane: number
  /** Wave amplitude as a fraction of the viewport height. */
  amplitude: number
  /** Wavelength as a fraction of the viewport width. */
  wavelength: number
  phase: number
  /** 0..1 visual weight (line width and opacity). */
  weight: number
}

const TAU = Math.PI * 2
const WAVE_SPEED = 0.55 // rad/s
const EXIT_SPREAD = 1.1 // the ribbon ends 2.1x as tall as the waist
const EXIT_SWAY = 0.006 // fraction of height

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

export function createStrands(count: number, random: () => number = Math.random): Strand[] {
  return Array.from({ length: count }, (_, i) => {
    const slot = (i + 0.5 + (random() - 0.5) * 0.7) / count
    return {
      start: slot,
      lane: count > 1 ? -1 + (2 * i) / (count - 1) : 0,
      amplitude: 0.012 + random() * 0.03,
      wavelength: 0.45 + random() * 0.4,
      phase: random() * TAU,
      weight: Math.pow(random(), 1.6),
    }
  })
}

/** Undisturbed height of `strand` at `x`, `time` seconds into the animation. */
export function strandY(strand: Strand, x: number, layout: StrandLayout, time: number): number {
  const laneY = layout.gateY + strand.lane * layout.waist

  if (x < layout.entryX) {
    const eased = smootherstep(clamp01(x / layout.entryX))
    const startY = layout.fanTop + strand.start * (layout.fanBottom - layout.fanTop)
    const wave =
      strand.amplitude *
      layout.height *
      Math.sin((x / (strand.wavelength * layout.width)) * TAU + strand.phase - time * WAVE_SPEED)
    return startY + (laneY - startY) * eased + wave * (1 - eased)
  }

  if (x <= layout.exitX) return laneY

  const opened = smoothstep(clamp01((x - layout.exitX) / Math.max(1, layout.width - layout.exitX)))
  const sway = Math.sin((x / layout.width) * TAU - time * 0.4) * layout.height * EXIT_SWAY
  return layout.gateY + strand.lane * layout.waist * (1 + EXIT_SPREAD * opened) + sway * opened
}
