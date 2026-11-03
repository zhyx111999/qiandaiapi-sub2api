import { describe, expect, it } from 'vitest'
import { GLOWS, driftX, driftY, offsetAt, type Drift } from '../fieldGlows'

/** Where an alternating sine-swing animation from -A to +A stands at its current time. */
const animatedAt = (d: Drift) => -d.amplitude * Math.cos((Math.PI * d.currentTimeMs) / d.swingMs)

describe('glow drift', () => {
  it('starts each compositor animation exactly on the sine path the canvas used to draw', () => {
    for (const glow of GLOWS) {
      for (const glowTime of [0, 1.7, 12.3, 95.4, 1000]) {
        const want = offsetAt(glow, glowTime)
        expect(animatedAt(driftX(glow, glowTime))).toBeCloseTo(want.x, 6)
        expect(animatedAt(driftY(glow, glowTime))).toBeCloseTo(want.y, 6)
      }
    }
  })

  it('keeps the animation time inside one period, whatever the clock', () => {
    for (const glow of GLOWS) {
      const d = driftX(glow, 1e6)
      expect(d.currentTimeMs).toBeGreaterThanOrEqual(0)
      expect(d.currentTimeMs).toBeLessThan(d.swingMs * 2)
    }
  })

  it('swings at the canvas speed: a full period takes 2π / (speed × glow clock rate)', () => {
    const glow = GLOWS[0]
    const a = animatedAt(driftX(glow, 10))
    const period = driftX(glow, 10).swingMs * 2
    // One full period later on the glow clock (1.6 clock seconds per second), the glow is back.
    expect(animatedAt(driftX(glow, 10 + (period / 1000) * 1.6))).toBeCloseTo(a, 6)
  })
})
