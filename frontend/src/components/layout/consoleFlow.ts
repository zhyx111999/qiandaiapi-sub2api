import { PulseTrain } from '@/components/home/landing/convergence/pulses'

/**
 * Clock and travelling pulses of the console backdrop. Every routed view mounts its own
 * AppLayout, so this state lives at module level: the flow continues across page changes
 * instead of restarting from phase zero.
 */
export const FLOW = {
  /** Multiplier on the strand wave clock. */
  waveSpeed: 1.6,
  /** Glow drift clock multiplier. */
  glowSpeed: 1.6,
  /** New pulses per second. */
  pulseRate: 1.8,
  /** Mean pulse speed, px/s. */
  pulseSpeed: 150,
  /** Trail length behind a pulse head, px. */
  pulseTail: 150,
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
  /** Strand wave clock, seconds. */
  waveTime: number
  /** Glow drift clock, seconds. */
  glowTime: number
  pulses: PulseTrain
  /** Fractional pulses owed to the spawner. */
  spawnDebt: number
}

export function createFlowState(): FlowState {
  return { waveTime: 0, glowTime: 0, pulses: new PulseTrain(), spawnDebt: 0 }
}

export const consoleFlow = createFlowState()

/**
 * Advances the clocks by `dt` seconds, spawns pulses at FLOW.pulseRate on random strands,
 * and drops pulses whose tail has left `fieldWidth`.
 */
export function stepFlow(state: FlowState, dt: number, fieldWidth: number, strandCount: number, random: () => number = Math.random): void {
  state.waveTime += dt * FLOW.waveSpeed
  state.glowTime += dt * FLOW.glowSpeed
  state.spawnDebt += dt * FLOW.pulseRate
  while (state.spawnDebt >= 1) {
    state.spawnDebt -= 1
    const strand = Math.floor(random() * strandCount)
    state.pulses.spawn(strand, -FLOW.pulseTail * 0.2, FLOW.pulseSpeed * (0.85 + random() * 0.3))
  }
  state.pulses.step(dt, fieldWidth, FLOW.pulseTail)
}
