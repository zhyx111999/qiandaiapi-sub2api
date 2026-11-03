import { describe, expect, it } from 'vitest'
import { PosedLines, applyAffine, placementMatrix, polylinesFromPath, smoothPolyline, strokeFromPoints } from '../lineFigure'
import { ORCA_TAIL_TIP, orcaStrokes } from '../orcaArt'
import { ORCA_SWIM, orcaDrawSeconds, orcaDrawn, orcaSwim } from '../orcaMotion'

describe('line figures', () => {
  it('reads absolute and relative path commands into polylines', () => {
    const [line] = polylinesFromPath('M10,10 l5,0 H30 v10 C30,30 40,30 40,20 z', 2)
    expect(line[0]).toEqual([10, 10])
    expect(line[1]).toEqual([15, 10])
    expect(line[2]).toEqual([30, 10])
    expect(line[3]).toEqual([30, 20])
    expect(line[5]).toEqual([40, 20]) // the curve ends where its end point says
    expect(line[line.length - 1]).toEqual([10, 10]) // z closes the subpath
    expect(polylinesFromPath('M0,0 L1,1 M5,5 L6,6')).toHaveLength(2)
  })

  it('smooths a traced line through its own points', () => {
    const smooth = smoothPolyline([[0, 0], [10, 10], [20, 0]], 1)
    expect(smooth[0]).toEqual([0, 0])
    expect(smooth[smooth.length - 1]).toEqual([20, 0])
    expect(smooth.some(([x, y]) => x === 10 && y === 10)).toBe(true)
    expect(smooth.length).toBeGreaterThan(20)
  })

  it('places the anchor on the page point, mirrored and turned', () => {
    const m = placementMatrix({ x: 100, y: 50, anchor: [10, 20], scale: 2, angle: 90, mirror: true })
    expect(applyAffine(m, 10, 20)).toEqual([100, 50])
    const [x, y] = applyAffine(m, 11, 20) // one unit right of the anchor: mirrored to the left, then turned a quarter clockwise
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(48)
  })

  it('draws a share of each stroke, cut inside a segment', () => {
    const strokes = [strokeFromPoints([[0, 0], [10, 0], [20, 0]])]
    const posed = new PosedLines(strokes)
    const identity = placementMatrix({ x: 0, y: 0, anchor: [0, 0], scale: 1, angle: 0 })
    posed.update(strokes, identity, () => 0.75)
    expect(posed.counts[0]).toBe(3)
    expect(posed.xs[0][2]).toBeCloseTo(15)
    posed.update(strokes, identity, () => 1)
    expect(posed.counts[0]).toBe(3)
    expect(posed.xs[0][2]).toBe(20)
    posed.update(strokes, identity, () => 0)
    expect(posed.counts[0]).toBe(0)
    posed.update(strokes, identity, () => 1, () => 4) // bent 4 units down everywhere
    expect(posed.ys[0][1]).toBe(4)
  })
})

describe('orca', () => {
  it('is the body outline followed by its details, the fluke tip on the outline', () => {
    const strokes = orcaStrokes()
    expect(strokes).toHaveLength(6)
    const body = strokes[0]
    const nearest = Math.min(...Array.from(body.xs, (x, i) => Math.hypot(x - ORCA_TAIL_TIP[0], body.ys[i] - ORCA_TAIL_TIP[1])))
    expect(nearest).toBeLessThan(1)
  })

  it('draws the outline first, the details while it closes, and finishes in time', () => {
    expect(orcaDrawn(0, 0)).toBe(0)
    expect(orcaDrawn(1, 0.5)).toBe(0)
    expect(orcaDrawn(0, 1)).toBeGreaterThan(orcaDrawn(1, 2.2))
    const done = orcaDrawSeconds(6)
    for (let i = 0; i < 6; i++) expect(orcaDrawn(i, done)).toBeCloseTo(1, 6)
  })

  it('swims within its rise and tilt', () => {
    for (let t = 0; t < ORCA_SWIM.period; t += 0.25) {
      const { rise, tilt } = orcaSwim(t, 300)
      expect(Math.abs(rise)).toBeLessThanOrEqual(ORCA_SWIM.rise * 300 + 1e-9)
      expect(Math.abs(tilt)).toBeLessThanOrEqual(ORCA_SWIM.tilt + 1e-9)
    }
    expect(orcaSwim(0, 300)).toEqual({ rise: -0, tilt: 0 })
  })
})
