import { describe, expect, it } from 'vitest'
import { FLOW, createFlowState, frameDue, stepFlow } from '../consoleFlow'

/** Frames drawn in one second of a display at `hz`, with optional vsync jitter (ms). */
function drawsPerSecond(hz: number, jitter = 0) {
  let lastDraw = 0
  let draws = 0
  for (let i = 1; i <= hz; i++) {
    const now = (i * 1000) / hz + (i % 2 ? jitter : -jitter)
    if (lastDraw && !frameDue(now, lastDraw)) continue
    lastDraw = now
    draws++
  }
  return draws
}

describe('console backdrop frame cap', () => {
  it('draws every frame of a 60 Hz display, even with vsync jitter', () => {
    expect(FLOW.maxFps).toBe(60)
    expect(drawsPerSecond(60)).toBe(60)
    expect(drawsPerSecond(60, 0.8)).toBe(60)
  })

  it('holds faster displays at or under 60', () => {
    expect(drawsPerSecond(120)).toBe(60)
    expect(drawsPerSecond(144)).toBeLessThanOrEqual(60)
    expect(drawsPerSecond(144)).toBeGreaterThanOrEqual(45)
    expect(drawsPerSecond(240)).toBe(60)
  })
})

describe('console backdrop flow', () => {
  it('advances both clocks at their configured speeds', () => {
    const state = createFlowState()
    stepFlow(state, 0.5, 640, 30, () => 0.5)
    expect(state.waveTime).toBeCloseTo(0.5 * FLOW.waveSpeed)
    expect(state.glowTime).toBeCloseTo(0.5 * FLOW.glowSpeed)
  })

  it('spawns pulses at the configured rate on valid strands', () => {
    const state = createFlowState()
    let seed = 0
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    // 10 s in 60 fps frames on a field wide enough that nothing leaves it.
    for (let i = 0; i < 600; i++) stepFlow(state, 1 / 60, 1e9, 30, random)
    const pulses = state.pulses.pulses
    // 10 s x rate; float accumulation over 600 frames may defer the last spawn by one frame.
    expect(pulses.length).toBeGreaterThanOrEqual(Math.floor(10 * FLOW.pulseRate) - 1)
    expect(pulses.length).toBeLessThanOrEqual(Math.floor(10 * FLOW.pulseRate))
    for (const pulse of pulses) {
      expect(Number.isInteger(pulse.strand)).toBe(true)
      expect(pulse.strand).toBeGreaterThanOrEqual(0)
      expect(pulse.strand).toBeLessThan(30)
      expect(pulse.speed).toBeGreaterThanOrEqual(FLOW.pulseSpeed * 0.85)
      expect(pulse.speed).toBeLessThanOrEqual(FLOW.pulseSpeed * 1.15)
    }
  })

  it('drops a pulse once its tail has left the field', () => {
    const state = createFlowState()
    state.pulses.spawn(3, 640 + FLOW.pulseTail - 1, 100)
    stepFlow(state, 0, 640, 30, () => 0.99)
    expect(state.pulses.pulses).toHaveLength(1)
    stepFlow(state, 0.05, 640, 30, () => 0.99)
    expect(state.pulses.pulses).toHaveLength(0)
  })
})
