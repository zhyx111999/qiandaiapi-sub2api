import { describe, expect, it } from 'vitest'
import { LENSING, lensDepth, lensInto, rrSdf, type GlassRect } from '../glassOptics'

const G: GlassRect = { x: 12, y: 12, w: 256, h: 876, r: 24 }
const { edge: K, band: BAND } = LENSING

/** The displacement map: screen depth s samples backdrop depth s - k(1 - s/band)². */
const sampled = (s: number) => s - K * (1 - s / BAND) ** 2

describe('glass lensing depth', () => {
  it('inverts the displacement map inside the band', () => {
    for (const sq of [-K, -K / 2, 0, 5, BAND / 2, BAND - 1]) {
      expect(sampled(lensDepth(sq, K, BAND))).toBeCloseTo(sq, 6)
    }
  })

  it('shows at the edge what lies k px outside, and leaves the inside alone', () => {
    expect(lensDepth(-K, K, BAND)).toBeCloseTo(0, 9)
    expect(lensDepth(BAND, K, BAND)).toBe(BAND)
    expect(lensDepth(BAND + 40, K, BAND)).toBe(BAND + 40)
  })

  it('is continuous and increasing across the whole range', () => {
    let previous = lensDepth(-K - 30, K, BAND)
    for (let sq = -K - 29.5; sq <= BAND + 10; sq += 0.5) {
      const s = lensDepth(sq, K, BAND)
      expect(s).toBeGreaterThan(previous)
      // The map's slope is at least 1, so its inverse never moves faster than the input: no jumps.
      expect(s - previous).toBeLessThanOrEqual(0.5 + 1e-9)
      previous = s
    }
    // Further than k outside stays outside, so the clip hides it.
    expect(lensDepth(-K - 1, K, BAND)).toBeLessThan(0)
  })
})

describe('lensing polyline points', () => {
  function lensOne(x: number, y: number) {
    const ys = new Float32Array([y])
    const xs = new Float32Array([x])
    const outX = new Float32Array(1)
    const outY = new Float32Array(1)
    lensInto(xs, ys, 6, G, K, outX, outY, 0, 0)
    return { x: outX[0], y: outY[0] }
  }

  it('pulls a point just outside the left edge into the band', () => {
    const p = lensOne(G.x - K / 2, 400)
    expect(p.y).toBeCloseTo(400, 3)
    expect(p.x).toBeGreaterThan(G.x)
    expect(p.x).toBeLessThan(G.x + BAND)
    expect(-rrSdf(p.x, p.y, G)).toBeCloseTo(lensDepth(-K / 2, K, BAND), 2)
  })

  it('leaves points far outside, and deep inside, where they are', () => {
    expect(lensOne(G.x + G.w + 200, 400)).toEqual({ x: G.x + G.w + 200, y: 400 })
    expect(lensOne(G.x + G.w / 2, 400)).toEqual({ x: G.x + G.w / 2, y: 400 })
  })

  it('bends along the outward normal at the top edge', () => {
    const p = lensOne(140, G.y - 4)
    expect(p.x).toBeCloseTo(140, 3)
    expect(p.y).toBeGreaterThan(G.y)
  })

  it('only writes the requested columns', () => {
    const ys = new Float32Array([400, 400, 400])
    const outX = new Float32Array([-1, -1, -1])
    const outY = new Float32Array([-1, -1, -1])
    lensInto(null, ys, 6, G, K, outX, outY, 1, 1)
    expect(outX[0]).toBe(-1)
    expect(outX[2]).toBe(-1)
    expect(outY[1]).toBeCloseTo(400, 3)
  })
})
