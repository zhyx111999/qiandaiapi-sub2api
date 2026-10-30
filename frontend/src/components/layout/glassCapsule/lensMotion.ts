/**
 * Motion of a selection capsule: a damped spring carries it to its item (stretching along its
 * travel, and resizing when items differ in size), and a second, livelier spring squeezes it
 * while a press is held and bounces it back on release. Shared by the sidebar lens and the
 * toolbar lens.
 */

export interface LensMotion {
  x: number
  y: number
  vx: number
  vy: number
  /** Target position (top-left of the item, px). */
  tx: number
  ty: number
  /** Size; capsules whose items all share one size leave these at their start values. */
  w: number
  h: number
  vw: number
  vh: number
  tw: number
  th: number
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

export function createMotion(x: number, y: number, w = 0, h = 0): LensMotion {
  return { x, y, vx: 0, vy: 0, tx: x, ty: y, w, h, vw: 0, vh: 0, tw: w, th: h, press: 1, vpress: 0, tpress: 1 }
}

/** Integrates the springs by `dt` seconds. Returns true while the capsule is still moving. */
export function stepMotion(m: LensMotion, dt: number): boolean {
  const { k, c } = TRAVEL_SPRING
  m.vx += (k * (m.tx - m.x) - c * m.vx) * dt
  m.vy += (k * (m.ty - m.y) - c * m.vy) * dt
  m.vw += (k * (m.tw - m.w) - c * m.vw) * dt
  m.vh += (k * (m.th - m.h) - c * m.vh) * dt
  m.x += m.vx * dt
  m.y += m.vy * dt
  m.w += m.vw * dt
  m.h += m.vh * dt
  m.vpress += (PRESS_SPRING.k * (m.tpress - m.press) - PRESS_SPRING.c * m.vpress) * dt
  m.press += m.vpress * dt

  const travelling = Math.abs(m.tx - m.x) > 0.3 || Math.abs(m.ty - m.y) > 0.3 || Math.hypot(m.vx, m.vy) > 2
  const resizing = Math.abs(m.tw - m.w) > 0.3 || Math.abs(m.th - m.h) > 0.3 || Math.hypot(m.vw, m.vh) > 2
  const pressing = Math.abs(m.tpress - m.press) > 0.002 || Math.abs(m.vpress) > 0.02
  if (travelling || resizing || pressing) return true
  m.x = m.tx
  m.y = m.ty
  m.w = m.tw
  m.h = m.th
  m.vx = m.vy = m.vw = m.vh = 0
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
 * Every routed view mounts its own AppLayout, so capsules are re-created on navigation.
 * Each capsule's last motion is remembered under its own key and resumed by the next one
 * if it is recent.
 */
const memory = new Map<string, { motion: LensMotion; savedAt: number }>()
const RESUME_WINDOW_MS = 800

export function rememberMotion(m: LensMotion, now: number, key = 'sidebar'): void {
  memory.set(key, { motion: { ...m }, savedAt: now })
}

/** The motion remembered under `key` if it was saved within the resume window, else null. */
export function resumeMotion(now: number, key = 'sidebar'): LensMotion | null {
  const saved = memory.get(key)
  if (!saved || now - saved.savedAt > RESUME_WINDOW_MS) return null
  return { ...saved.motion }
}

/** Test hook. */
export function forgetMotion(): void {
  memory.clear()
}
