import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A hand-driven requestAnimationFrame: frames only run when the test says so. */
let queue: FrameRequestCallback[] = []
function runFrame(now: number) {
  const callbacks = queue
  queue = []
  callbacks.forEach((cb) => cb(now))
}

async function loadFrame() {
  vi.resetModules()
  return import('../consoleFrame')
}

beforeEach(() => {
  queue = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = []
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('console frame loop', () => {
  it('runs woken tasks in their fixed order, whatever the order they were added or woken', async () => {
    const { addFrameTask, FRAME_ORDER } = await loadFrame()
    const calls: string[] = []
    const field = addFrameTask(FRAME_ORDER.field, () => (calls.push('field'), false))
    const lens = addFrameTask(FRAME_ORDER.lens, () => (calls.push('lens'), false))
    field.wake()
    lens.wake()
    expect(queue).toHaveLength(1) // one loop for both
    runFrame(16)
    expect(calls).toEqual(['lens', 'field'])
  })

  it('keeps running a task while it asks for frames, then sleeps', async () => {
    const { addFrameTask } = await loadFrame()
    let left = 3
    const task = addFrameTask(0, () => --left > 0)
    task.wake()
    runFrame(16)
    runFrame(33)
    runFrame(50)
    expect(left).toBe(0)
    expect(queue).toHaveLength(0)
  })

  it('lets a task wake a later one in the same frame', async () => {
    const { addFrameTask } = await loadFrame()
    const calls: string[] = []
    const second = addFrameTask(1, () => (calls.push('second'), false))
    const first = addFrameTask(0, () => (calls.push('first'), second.wake(), false))
    first.wake()
    runFrame(16)
    expect(calls).toEqual(['first', 'second'])
    expect(queue).toHaveLength(0)
  })

  it('requests exactly one next frame, even when running tasks keep waking each other', async () => {
    const { addFrameTask } = await loadFrame()
    const second = addFrameTask(1, () => true)
    const first = addFrameTask(0, () => (second.wake(), true))
    first.wake()
    for (let i = 1; i <= 5; i++) {
      runFrame(i * 16)
      expect(queue).toHaveLength(1)
    }
  })

  it('drops removed tasks and stops the loop when nothing is left', async () => {
    const { addFrameTask } = await loadFrame()
    const run = vi.fn(() => true)
    const task = addFrameTask(0, run)
    task.wake()
    task.remove()
    runFrame(16)
    expect(run).not.toHaveBeenCalled()
    expect(queue).toHaveLength(0)
  })
})
