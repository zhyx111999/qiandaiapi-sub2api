import { FLOW } from './consoleFlow'

/**
 * The three soft glows drifting behind the console field. They are plain elements under the strand
 * canvas, moved by compositor animations, so the canvas does not repaint them every frame. Each
 * drifts on sine paths: x = x·W + ax·sin(glowTime·sx + phase), y = y·H + ay·cos(glowTime·sy + phase),
 * where glowTime advances FLOW.glowSpeed seconds per second (consoleFlow).
 */
export interface Glow {
  /** Rest position as a fraction of the field width / height. */
  x: number
  y: number
  /** Radius, px. */
  r: number
  rgb: string
  /** Centre opacity (dark theme: ×0.75). */
  a: number
  /** Angular speed on each axis, radians per glowTime second. */
  sx: number
  sy: number
  /** Drift amplitude on each axis, px. */
  ax: number
  ay: number
  phase: number
}

export const GLOWS: readonly Glow[] = [
  { x: 0.2, y: 0.26, r: 260, rgb: '59 146 113', a: 0.22, sx: 0.13, sy: 0.11, ax: 40, ay: 70, phase: 0 },
  { x: 0.34, y: 0.72, r: 300, rgb: '214 170 96', a: 0.14, sx: 0.09, sy: 0.15, ax: 50, ay: 60, phase: 2.1 },
  { x: 0.06, y: 0.96, r: 230, rgb: '101 179 148', a: 0.18, sx: 0.17, sy: 0.07, ax: 30, ay: 40, phase: 4.2 },
]

export const DARK_GLOW_ALPHA = 0.75

/** Ease-in-out sine: one half period of a sine swing between two extremes. */
export const SINE_SWING = 'cubic-bezier(0.37, 0, 0.63, 1)'

export interface Drift {
  amplitude: number
  /** Duration of one swing from -amplitude to +amplitude (half a period), ms. */
  swingMs: number
  /** Where an alternating swing animation must stand to match `glowTime` now, ms. */
  currentTimeMs: number
}

/**
 * An alternating animation from -A to +A with a sine swing stands at -A·cos(ω·τ) at time τ. The
 * drift A·sin(θ) equals -A·cos(θ + π/2) and A·cos(θ) equals -A·cos(θ + π), so the animation time is
 * the angle shifted by a quarter (x) or half (y) turn, over ω.
 */
function drift(amplitude: number, speed: number, angle: number, shift: number): Drift {
  const omega = speed * FLOW.glowSpeed // radians per real second
  const period = (2 * Math.PI) / omega
  const tau = ((((angle + shift) / omega) % period) + period) % period
  return { amplitude, swingMs: (period / 2) * 1000, currentTimeMs: tau * 1000 }
}

export const driftX = (g: Glow, glowTime: number) => drift(g.ax, g.sx, glowTime * g.sx + g.phase, Math.PI / 2)
export const driftY = (g: Glow, glowTime: number) => drift(g.ay, g.sy, glowTime * g.sy + g.phase, Math.PI)

/** The offset the drift has at `glowTime` (still frames under reduced motion). */
export const offsetAt = (g: Glow, glowTime: number) => ({
  x: Math.sin(glowTime * g.sx + g.phase) * g.ax,
  y: Math.cos(glowTime * g.sy + g.phase) * g.ay,
})
