import { describe, expect, it } from 'vitest'
import { applyAffine, placementMatrix, type Placement } from '@/components/common/lineArt/lineFigure'
import { ORCA_TAIL_TIP, orcaStrokes } from '@/components/common/lineArt/orcaArt'
import { coverComposition, type TextBox } from '../coverComposition'
import { ORCA_FROM, sprayAt, swell, waveDrawSeconds, waveDrawn } from '../seaWave'
import { WAVE_LEAP_POINT, WAVE_VIEWBOX, waveLines } from '../waveArt'

function extent(placement: Placement) {
  const m = placementMatrix(placement)
  const pts = orcaStrokes().flatMap((s) => Array.from(s.xs, (x, i) => applyAffine(m, x, s.ys[i])))
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
  }
}

/** The wordmark as the stage lays it out: 74% of the width at most, centred at `gateY`. */
function text(width: number, gateY: number, fontSize: number): TextBox {
  const w = Math.min(width * 0.74, fontSize * 4.55)
  return { left: width / 2 - w / 2, right: width / 2 + w / 2, top: gateY - fontSize * 0.37, bottom: gateY + fontSize * 0.37 }
}

describe('cover composition', () => {
  const cases = [
    { name: 'desktop', width: 1440, gateY: 423, fontSize: 209, artTop: 148 },
    { name: 'phone', width: 390, gateY: 338, fontSize: 64, artTop: 132 },
    { name: 'short wide screen', width: 1680, gateY: 300, fontSize: 232, artTop: 148 },
  ]

  for (const c of cases) {
    it(`leaps out of the wave below the header and inside the screen (${c.name})`, () => {
      const box = text(c.width, c.gateY, c.fontSize)
      const { wave, orca } = coverComposition(box, c.fontSize, c.width, c.artTop, orcaStrokes())
      // The orca's tail is at the wave's foot.
      const leap = applyAffine(placementMatrix(wave), WAVE_LEAP_POINT[0], WAVE_LEAP_POINT[1])
      const tail = applyAffine(placementMatrix(orca), ORCA_TAIL_TIP[0], ORCA_TAIL_TIP[1])
      expect(tail[0]).toBeCloseTo(leap[0])
      expect(tail[1]).toBeCloseTo(leap[1])
      // Head and fin above the title, never above the header line; inside the screen.
      const { minX, maxX, minY } = extent(orca)
      expect(minY).toBeLessThan(box.top)
      expect(minY).toBeGreaterThanOrEqual(c.artTop - 0.5)
      expect(minX).toBeGreaterThanOrEqual(7.5)
      expect(maxX).toBeLessThanOrEqual(c.width)
      // The wave sits at the title's lower right.
      const waveTopLeft = applyAffine(placementMatrix(wave), 0, 0)
      expect(wave.x).toBeLessThanOrEqual(c.width)
      expect(waveTopLeft[0]).toBeGreaterThan(box.left + (box.right - box.left) / 2)
      expect(wave.y).toBeGreaterThan(box.bottom)
    })
  }
})

describe('sea wave', () => {
  const lines = waveLines()

  it('has crests, sea lines and reaches that continue the lowest swells', () => {
    const kinds = lines.map((l) => l.kind)
    expect(kinds.filter((k) => k === 'crest')).toHaveLength(7)
    expect(kinds.filter((k) => k === 'sea')).toHaveLength(5)
    const seas = lines.filter((l) => l.kind === 'sea').slice(-3)
    const reaches = lines.filter((l) => l.kind === 'reach')
    expect(reaches).toHaveLength(3)
    reaches.forEach((reach, i) => {
      expect(reach.stroke.xs[0]).toBeCloseTo(seas[i].stroke.xs[0])
      expect(reach.stroke.ys[0]).toBeCloseTo(seas[i].stroke.ys[0])
      expect(reach.stroke.xs[reach.stroke.xs.length - 1]).toBeLessThan(-300) // well left of the wave, under the title
    })
    for (const { stroke } of lines) {
      for (let i = 0; i < stroke.xs.length; i++) expect(stroke.ys[i]).toBeLessThanOrEqual(WAVE_VIEWBOX.height + 1)
    }
  })

  it('is drawn sea first, then crests, then reaches; the orca starts while it is still being drawn', () => {
    const at = (t: number) => waveDrawn(lines, t)
    const seaFirst = lines.findIndex((l) => l.kind === 'sea')
    const crestFirst = lines.findIndex((l) => l.kind === 'crest')
    const reachFirst = lines.findIndex((l) => l.kind === 'reach')
    expect(at(0.3)[seaFirst]).toBeGreaterThan(0)
    expect(at(0.3)[crestFirst]).toBe(0)
    expect(at(0.9)[reachFirst]).toBe(0)
    for (const share of at(waveDrawSeconds(lines))) expect(share).toBeCloseTo(1, 6)
    expect(ORCA_FROM).toBeLessThan(waveDrawSeconds(lines))
  })

  it('moves swells through the sea while the crests hold, and fades the spray in', () => {
    expect(swell('crest', 0, 100, 3)).toBe(0)
    expect(swell('sea', 5, 100, 0)).not.toBe(swell('sea', 5, 100, 1))
    expect(sprayAt(2, 0)).toHaveLength(0)
    const drops = sprayAt(7, 10)
    expect(drops.length).toBeGreaterThan(0)
    for (const drop of drops) {
      expect(drop.alpha).toBeGreaterThan(0)
      expect(drop.alpha).toBeLessThanOrEqual(1)
    }
  })
})
