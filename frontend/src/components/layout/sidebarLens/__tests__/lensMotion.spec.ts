import { afterEach, describe, expect, it } from 'vitest'
import {
  PRESS_DEPTH,
  createMotion,
  forgetMotion,
  lensScale,
  rememberMotion,
  resumeMotion,
  stepMotion
} from '../lensMotion'

const DT = 1 / 60

function run(motion: ReturnType<typeof createMotion>, frames: number, onFrame?: () => void) {
  let moving = true
  for (let i = 0; i < frames && moving; i++) {
    moving = stepMotion(motion, DT)
    onFrame?.()
  }
  return moving
}

describe('lens travel', () => {
  it('flows to a new target and settles exactly on it', () => {
    const motion = createMotion(20, 100)
    motion.ty = 300
    let peak = motion.y
    const moving = run(motion, 600, () => (peak = Math.max(peak, motion.y)))
    expect(moving).toBe(false)
    expect(motion.y).toBe(300)
    expect(motion.x).toBe(20)
    // One soft overshoot (damping ~0.78), never a wild swing.
    expect(peak).toBeGreaterThan(300)
    expect(peak).toBeLessThan(300 + 200 * 0.05)
  })

  it('stretches along its travel and is round at rest', () => {
    const motion = createMotion(0, 0)
    motion.ty = 400
    run(motion, 6)
    const moving = lensScale(motion)
    expect(moving.sy).toBeGreaterThan(1)
    expect(moving.sx).toBeLessThan(1)
    run(motion, 600)
    expect(lensScale(motion)).toEqual({ sx: 1, sy: 1 })
  })
})

describe('lens press', () => {
  it('squeezes while held, flatter vertically', () => {
    const motion = createMotion(0, 0)
    motion.tpress = PRESS_DEPTH
    run(motion, 600)
    expect(motion.press).toBe(PRESS_DEPTH)
    const { sx, sy } = lensScale(motion)
    expect(sx).toBeCloseTo(PRESS_DEPTH, 5)
    expect(sy).toBeLessThan(sx)
  })

  it('bounces past rest on release, then settles at 1', () => {
    const motion = createMotion(0, 0)
    motion.tpress = PRESS_DEPTH
    run(motion, 600)
    motion.tpress = 1
    let peak = motion.press
    const moving = run(motion, 600, () => (peak = Math.max(peak, motion.press)))
    expect(moving).toBe(false)
    expect(motion.press).toBe(1)
    expect(peak).toBeGreaterThan(1.01)
  })
})

describe('lens memory across layout remounts', () => {
  afterEach(() => forgetMotion())

  it('resumes a recent flight and forgets a stale one', () => {
    const motion = createMotion(5, 50)
    motion.ty = 200
    motion.vy = 900
    rememberMotion(motion, 1000)

    const resumed = resumeMotion(1500)
    expect(resumed).toMatchObject({ x: 5, y: 50, ty: 200, vy: 900 })
    expect(resumed).not.toBe(motion)
    expect(resumeMotion(1000 + 801)).toBeNull()
  })
})
