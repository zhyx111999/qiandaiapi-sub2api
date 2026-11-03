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
  it('advances the orca clock in real time and the glow clock at its configured speed', () => {
    const state = createFlowState()
    stepFlow(state, 0.5)
    stepFlow(state, 0.25)
    expect(state.orcaTime).toBeCloseTo(0.75)
    expect(state.glowTime).toBeCloseTo(0.75 * FLOW.glowSpeed)
  })
})
