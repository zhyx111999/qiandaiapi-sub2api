import { describe, expect, it } from 'vitest'
import { BODY_COUNT, initialState, integrateFigureEight, sampleOrbit } from '../orbit'

const table = integrateFigureEight()
const stride = BODY_COUNT * 2

describe('figure-eight orbit', () => {
  it('closes on itself after one period', () => {
    const start = initialState().positions
    const end = sampleOrbit(table, 1 - 1e-9, new Float64Array(stride))
    for (let k = 0; k < stride; k++) {
      expect(Math.abs(end[k] - start[k])).toBeLessThan(1e-3)
    }
  })

  it('keeps the centre of mass at the origin', () => {
    const out = new Float64Array(stride)
    for (const phase of [0.13, 0.37, 0.61, 0.89]) {
      sampleOrbit(table, phase, out)
      expect(Math.abs(out[0] + out[2] + out[4])).toBeLessThan(1e-6)
      expect(Math.abs(out[1] + out[3] + out[5])).toBeLessThan(1e-6)
    }
  })

  it('is a choreography: every body follows the same curve a third of a period apart', () => {
    const a = sampleOrbit(table, 0.2, new Float64Array(stride))
    const b = sampleOrbit(table, 0.2 + 1 / 3, new Float64Array(stride))
    expect(b[0]).toBeCloseTo(a[4], 3)
    expect(b[1]).toBeCloseTo(a[5], 3)
  })

  it('wraps phases outside [0, 1)', () => {
    const a = sampleOrbit(table, 0.25, new Float64Array(stride))
    const b = sampleOrbit(table, 3.25, new Float64Array(stride))
    const c = sampleOrbit(table, -0.75, new Float64Array(stride))
    expect(Array.from(b)).toEqual(Array.from(a))
    expect(Array.from(c)).toEqual(Array.from(a))
  })
})
