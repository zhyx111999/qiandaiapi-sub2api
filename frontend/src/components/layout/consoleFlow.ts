/**
 * Clocks of the console backdrop. Every routed view mounts its own AppLayout, so this state lives
 * at module level: the orca is drawn on once per tab and swims on across page changes, and the
 * glows keep drifting, instead of starting over on every page.
 */
export const FLOW = {
  /** Glow drift clock multiplier. */
  glowSpeed: 1.6,
  /** Frame cap, whatever the display refresh rate. */
  maxFps: 60,
} as const

const FRAME_MS = 1000 / FLOW.maxFps
/** Vsync jitter allowance, so a display at exactly the cap never skips a frame. */
const FRAME_SLACK_MS = 2

/** True when a frame at `now` (ms) is due after the last drawn one at `lastDraw`. */
export function frameDue(now: number, lastDraw: number): boolean {
  return now - lastDraw >= FRAME_MS - FRAME_SLACK_MS
}

export interface FlowState {
  /** Orca clock, seconds: its drawing and its swim. */
  orcaTime: number
  /** Glow drift clock, seconds. */
  glowTime: number
}

export function createFlowState(): FlowState {
  return { orcaTime: 0, glowTime: 0 }
}

export const consoleFlow = createFlowState()

/** Advances the clocks by `dt` seconds. */
export function stepFlow(state: FlowState, dt: number): void {
  state.orcaTime += dt
  state.glowTime += dt * FLOW.glowSpeed
}
