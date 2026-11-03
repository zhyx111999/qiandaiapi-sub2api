import { beforeEach, describe, expect, it } from 'vitest'
import { GOVERNOR, createGovernor, fieldQuality, qualitySteps, savedQuality, setFieldQuality, type FieldQuality } from '../fieldQuality'

/** Feeds `count` frames of `ms` each and returns the steps the governor asked for. */
function feed(gov: ReturnType<typeof createGovernor>, ms: number, count: number): FieldQuality[] {
  const out: FieldQuality[] = []
  for (let i = 0; i < count; i++) {
    const next = gov.record(ms)
    if (next) out.push(next)
  }
  return out
}
const judged = GOVERNOR.warmup + GOVERNOR.window * GOVERNOR.confirm

describe('field quality governor', () => {
  it('keeps the full field on a device that keeps up', () => {
    const gov = createGovernor('full', qualitySteps(2))
    expect(feed(gov, 16.7, judged * 5)).toEqual([])
    expect(feed(gov, 8.3, judged * 5)).toEqual([]) // 120 Hz
  })

  it('steps down on sustained slow frames, settling between steps', () => {
    const gov = createGovernor('full', qualitySteps(2))
    expect(feed(gov, 40, judged)).toEqual(['lowres'])
    expect(feed(gov, 40, judged - 1)).toEqual([]) // the lighter step gets its own warm-up
    expect(feed(gov, 40, 1)).toEqual(['still'])
    expect(feed(gov, 40, judged * 3)).toEqual([]) // nothing below still
  })

  it('goes straight to a still field where there is no lower resolution to try', () => {
    expect(feed(createGovernor('full', qualitySteps(1)), 40, judged)).toEqual(['still'])
  })

  it('does not step down for a short stall or for pauses', () => {
    const gov = createGovernor('full', qualitySteps(2))
    feed(gov, 16.7, GOVERNOR.warmup)
    expect(feed(gov, 40, GOVERNOR.window)).toEqual([]) // one slow window only
    expect(feed(gov, 16.7, GOVERNOR.window)).toEqual([]) // recovered: strikes reset
    expect(feed(gov, 40, GOVERNOR.window)).toEqual([])
    expect(feed(gov, 1000, judged * 2)).toEqual([]) // hidden tab / breakpoints are not frames
  })

  it('ignores the warm-up frames while the page settles', () => {
    const gov = createGovernor('full', qualitySteps(2))
    expect(feed(gov, 80, GOVERNOR.warmup)).toEqual([])
    expect(feed(gov, 16.7, GOVERNOR.window * GOVERNOR.confirm)).toEqual([])
  })

  describe('session memory', () => {
    beforeEach(() => sessionStorage.clear())

    it('starts where the tab settled, and shares the step with the light', () => {
      expect(savedQuality()).toBe('full')
      setFieldQuality('still')
      expect(fieldQuality.value).toBe('still')
      expect(savedQuality()).toBe('still')
      sessionStorage.setItem('yezi:field-quality', 'bogus')
      expect(savedQuality()).toBe('full')
    })
  })
})
