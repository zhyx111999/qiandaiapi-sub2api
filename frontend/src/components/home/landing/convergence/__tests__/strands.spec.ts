import { describe, expect, it } from 'vitest'
import { createStrands, strandY, type StrandLayout } from '../strands'

const layout: StrandLayout = {
  width: 1600,
  height: 900,
  fanTop: 90,
  fanBottom: 846,
  gateY: 420,
  entryX: 360,
  exitX: 1240,
  waist: 40,
}

/** Deterministic random source so the tests do not depend on Math.random. */
function seeded(seed = 7) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const strands = createStrands(40, seeded())
const xsAcross = Array.from({ length: 161 }, (_, i) => -40 + i * 10.25)

describe('convergence strands', () => {
  it('fan out over the configured span at the left edge, waves included', () => {
    const ys = strands.map((s) => strandY(s, 0, layout, 0))
    const wave = layout.height * 0.042
    expect(Math.min(...ys)).toBeGreaterThan(layout.fanTop - wave)
    expect(Math.min(...ys)).toBeLessThan(layout.fanTop + 60)
    expect(Math.max(...ys)).toBeLessThan(layout.fanBottom + wave)
    expect(Math.max(...ys)).toBeGreaterThan(layout.fanBottom - 60)
  })

  it('run flat in their lanes through the gateway', () => {
    for (const x of [layout.entryX, 800, layout.exitX]) {
      strands.forEach((s) => {
        expect(strandY(s, x, layout, 3.7)).toBeCloseTo(layout.gateY + s.lane * layout.waist, 6)
      })
    }
    const band = strands.map((s) => strandY(s, 800, layout, 0))
    expect(Math.max(...band) - Math.min(...band)).toBeCloseTo(layout.waist * 2, 6)
  })

  it('leave as a ribbon that widens but stays within twice the band height on each side', () => {
    const ys = strands.map((s) => strandY(s, layout.width, layout, 0))
    const spread = Math.max(...ys) - Math.min(...ys)
    expect(spread).toBeGreaterThan(layout.waist * 2)
    expect(spread).toBeLessThan(layout.waist * 2 * 2.2)
  })

  it('never cross: top-to-bottom order holds from the gateway onwards', () => {
    for (const x of xsAcross.filter((x) => x >= layout.entryX)) {
      const ys = strands.map((s) => strandY(s, x, layout, 1.3))
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
  })

  it('are continuous where the three sections meet', () => {
    for (const s of strands) {
      for (const edge of [layout.entryX, layout.exitX]) {
        const before = strandY(s, edge - 0.01, layout, 2)
        const after = strandY(s, edge + 0.01, layout, 2)
        expect(Math.abs(after - before)).toBeLessThan(0.05)
      }
    }
  })
})
