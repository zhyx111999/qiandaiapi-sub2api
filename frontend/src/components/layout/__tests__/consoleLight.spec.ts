import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REST_ANGLE, addLightRim, followPointerLight, lightAngle, shortestTurn } from '../consoleLight'

describe('glass light', () => {
  it('measures the pointer direction clockwise from up', () => {
    expect(lightAngle(500, 0, 500, 500)).toBeCloseTo(0)
    expect(lightAngle(1000, 500, 500, 500)).toBeCloseTo(90)
    expect(lightAngle(500, 1000, 500, 500)).toBeCloseTo(180)
    expect(lightAngle(0, 500, 500, 500)).toBeCloseTo(270)
    expect(lightAngle(0, 0, 500, 500)).toBeCloseTo(315) // top left, the resting light
  })

  it('turns the short way round', () => {
    expect(shortestTurn(350, 10)).toBeCloseTo(20)
    expect(shortestTurn(10, 350)).toBeCloseTo(-20)
    expect(shortestTurn(90, 270)).toBeCloseTo(180)
    expect(shortestTurn(315, 315)).toBeCloseTo(0)
  })
})

describe('light rims', () => {
  let frames: FrameRequestCallback[] = []
  const runFrames = (n: number) => {
    for (let i = 0; i < n; i++) {
      const due = frames
      frames = []
      due.forEach((cb) => cb(performance.now()))
    }
  }
  const angle = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--light'))

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lights only the registered rims, never the page root', () => {
    const rim = document.createElement('div')
    const other = document.createElement('div')
    const remove = addLightRim(rim)
    expect(angle(rim)).toBeCloseTo(REST_ANGLE)

    const stop = followPointerLight()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: window.innerWidth, clientY: window.innerHeight / 2 }))
    runFrames(80)
    expect(angle(rim)).toBeCloseTo(90, 0) // turned toward the pointer on the right
    expect(other.style.getPropertyValue('--light')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--light')).toBe('')

    // A rim that has gone stops being written to.
    remove()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: window.innerWidth / 2, clientY: window.innerHeight }))
    runFrames(80)
    expect(angle(rim)).toBeCloseTo(90, 0)

    // A rim added later starts at the light's current angle.
    const late = document.createElement('div')
    addLightRim(late)
    expect(angle(late)).toBeCloseTo(180, 0)
    stop()
  })
})
