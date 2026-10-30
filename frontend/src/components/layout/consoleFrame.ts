/**
 * One requestAnimationFrame loop for everything the console animates, run in a fixed order each
 * frame: the selection capsules move first, then the field draws the glass where the sidebar's
 * capsule now is, then the specular light eases. Separate loops would run in whatever order they happened to
 * be scheduled, and the canvas would trail the capsule by a frame.
 *
 * A task returns true while it still needs frames; the loop sleeps when none does.
 */
export type FrameTask = (now: number) => boolean

export const FRAME_ORDER = { lens: 0, field: 1, light: 2 } as const

interface Entry {
  order: number
  run: FrameTask
  active: boolean
}

const entries: Entry[] = []
let raf = 0
let running = false

function frame(now: number) {
  raf = 0
  running = true
  for (const entry of entries.slice()) {
    if (entry.active) entry.active = entry.run(now)
  }
  running = false
  // Exactly one request per frame. A task woken while the frame runs has either run already (it
  // comes later in the order) or is picked up here for the next frame.
  if (entries.some((entry) => entry.active)) raf = requestAnimationFrame(frame)
}

export interface FrameHandle {
  /** Asks for the task to run on the next frame (and every frame after while it returns true). */
  wake(): void
  remove(): void
}

export function addFrameTask(order: number, run: FrameTask): FrameHandle {
  const entry: Entry = { order, run, active: false }
  entries.push(entry)
  entries.sort((a, b) => a.order - b.order)
  return {
    wake() {
      entry.active = true
      if (!raf && !running) raf = requestAnimationFrame(frame)
    },
    remove() {
      const index = entries.indexOf(entry)
      if (index >= 0) entries.splice(index, 1)
      if (!entries.some((other) => other.active) && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
  }
}
