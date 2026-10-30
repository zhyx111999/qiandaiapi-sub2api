/**
 * Motion of the sidebar selection lens: a damped spring carries the capsule to the active
 * item (stretching along its travel), and a second, livelier spring squeezes it while a
 * press is held and bounces it back on release.
 */

export interface LensMotion {
  x: number
  y: number
  vx: number
  vy: number
  /** Target position (top-left of the active item, px). */
  tx: number
  ty: number
  /** Press scale: 1 at rest, PRESS_DEPTH while held. */
  press: number
  vpress: number
  tpress: number
}

/** Travel spring, damping ratio ~0.78: one soft overshoot, then it settles. */
export const TRAVEL_SPRING = { k: 320, c: 28 } as const
/** Press spring, damping ratio ~0.33: a lively bounce on release. */
export const PRESS_SPRING = { k: 600, c: 16 } as const
export const PRESS_DEPTH = 0.94
const MAX_STRETCH = 0.24
const STRETCH_PER_PX_S = 1 / 3800

export function createMotion(x: number, y: number): LensMotion {
  return { x, y, vx: 0, vy: 0, tx: x, ty: y, press: 1, vpress: 0, tpress: 1 }
}

/** Integrates both springs by `dt` seconds. Returns true while the lens is still moving. */
export function stepMotion(m: LensMotion, dt: number): boolean {
  m.vx += (TRAVEL_SPRING.k * (m.tx - m.x) - TRAVEL_SPRING.c * m.vx) * dt
  m.vy += (TRAVEL_SPRING.k * (m.ty - m.y) - TRAVEL_SPRING.c * m.vy) * dt
  m.x += m.vx * dt
  m.y += m.vy * dt
  m.vpress += (PRESS_SPRING.k * (m.tpress - m.press) - PRESS_SPRING.c * m.vpress) * dt
  m.press += m.vpress * dt

  const travelling = Math.abs(m.tx - m.x) > 0.3 || Math.abs(m.ty - m.y) > 0.3 || Math.hypot(m.vx, m.vy) > 2
  const pressing = Math.abs(m.tpress - m.press) > 0.002 || Math.abs(m.vpress) > 0.02
  if (travelling || pressing) return true
  m.x = m.tx
  m.y = m.ty
  m.vx = 0
  m.vy = 0
  m.press = m.tpress
  m.vpress = 0
  return false
}

/** Scale factors: stretch along the travel axis, times the press squeeze (flatter vertically). */
export function lensScale(m: LensMotion): { sx: number; sy: number } {
  const stretch = Math.min(MAX_STRETCH, Math.hypot(m.vx, m.vy) * STRETCH_PER_PX_S)
  const vertical = Math.abs(m.vy) >= Math.abs(m.vx)
  const sx = (vertical ? 1 - stretch * 0.45 : 1 + stretch) * m.press
  const sy = (vertical ? 1 + stretch : 1 - stretch * 0.45) * (1 - (1 - m.press) * 1.5)
  return { sx, sy }
}

/**
 * Every routed view mounts its own AppLayout, so the lens is re-created on navigation.
 * The last motion is remembered here and resumed by the next lens if it is recent.
 */
const memory: { motion: LensMotion | null; savedAt: number; releasedAt: number } = {
  motion: null,
  savedAt: 0,
  releasedAt: 0
}
const RESUME_WINDOW_MS = 800

export function rememberMotion(m: LensMotion, now: number): void {
  memory.motion = { ...m }
  memory.savedAt = now
}

export function rememberRelease(now: number): void {
  memory.releasedAt = now
}

/** The remembered motion if it was saved within the resume window, else null. */
export function resumeMotion(now: number): LensMotion | null {
  if (!memory.motion || now - memory.savedAt > RESUME_WINDOW_MS) return null
  return { ...memory.motion }
}

/** Milliseconds since the last release, or Infinity. */
export function sinceRelease(now: number): number {
  return memory.releasedAt ? now - memory.releasedAt : Infinity
}

/** Test hook. */
export function forgetMotion(): void {
  memory.motion = null
  memory.savedAt = 0
  memory.releasedAt = 0
}
