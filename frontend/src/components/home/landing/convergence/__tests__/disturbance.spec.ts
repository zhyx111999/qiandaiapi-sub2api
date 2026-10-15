import { describe, expect, it } from 'vitest'
import { StrandDisturbance } from '../disturbance'

function settle(d: StrandDisturbance, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) d.step(1 / 60)
}

describe('strand disturbance', () => {
  it('is zero when nothing happens', () => {
    const d = new StrandDisturbance()
    settle(d, 1)
    expect(d.offset(300, 400)).toBe(0)
  })

  it('combs strands away from the pointer, upwards above it and downwards below it', () => {
    const d = new StrandDisturbance()
    d.setPointer(500, 400)
    settle(d, 1)
    expect(d.offset(500, 380)).toBeLessThan(0)
    expect(d.offset(500, 420)).toBeGreaterThan(0)
    expect(Math.abs(d.offset(1500, 400))).toBeLessThan(1e-6)
  })

  it('stays continuous across the pointer height (no kinks in a strand)', () => {
    const d = new StrandDisturbance()
    d.setPointer(500, 400)
    d.pluck(500, 400)
    settle(d, 0.1)
    for (let y = 380; y < 420; y += 0.5) {
      expect(Math.abs(d.offset(500, y + 0.5) - d.offset(500, y))).toBeLessThan(2)
    }
  })

  it('lets a pluck die out and the comb fade after the pointer leaves', () => {
    const d = new StrandDisturbance()
    d.setPointer(500, 400)
    d.pluck(500, 400)
    settle(d, 0.2)
    d.leave()
    settle(d, 3.5)
    expect(Math.abs(d.offset(500, 430))).toBeLessThan(0.05)
  })
})
