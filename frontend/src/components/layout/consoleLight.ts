import { FRAME_ORDER, addFrameTask } from './consoleFrame'

/**
 * Specular light of the console glass. The rims are conic gradients starting at `--light`; the
 * angle turns toward the pointer (from the viewport centre, like one light source over the
 * page), eased so it glides instead of snapping. Pointer moves are only sampled once per frame.
 */
export const REST_ANGLE = 315 // light from the top left
const EASE = 0.18 // share of the remaining turn taken per frame
const SETTLE_DEG = 0.3

/** Angle in degrees, clockwise from up, of the direction from (cx, cy) toward (px, py). */
export function lightAngle(px: number, py: number, cx: number, cy: number): number {
  const deg = (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. */
export function shortestTurn(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180
  return d === -180 ? 180 : d
}

/** Starts following the pointer; returns the stop function. */
export function followPointerLight(root: HTMLElement = document.documentElement): () => void {
  let current = REST_ANGLE
  let target = REST_ANGLE
  root.style.setProperty('--light', `${REST_ANGLE}deg`)
  const task = addFrameTask(FRAME_ORDER.light, () => {
    const turn = shortestTurn(current, target)
    current = Math.abs(turn) < SETTLE_DEG ? target : (current + turn * EASE + 360) % 360
    root.style.setProperty('--light', `${current.toFixed(1)}deg`)
    return current !== target
  })
  const onMove = (event: PointerEvent) => {
    target = lightAngle(event.clientX, event.clientY, window.innerWidth / 2, window.innerHeight / 2)
    task.wake()
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => {
    window.removeEventListener('pointermove', onMove)
    task.remove()
  }
}
