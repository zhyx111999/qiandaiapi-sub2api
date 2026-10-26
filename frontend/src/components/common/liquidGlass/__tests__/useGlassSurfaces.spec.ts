import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeGlassSurfaces } from '../useGlassSurfaces'

const { attach, destroy } = vi.hoisted(() => ({ attach: vi.fn(), destroy: vi.fn() }))
vi.mock('../refraction', () => ({ attachRefraction: attach }))

async function flushObserver() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

describe('shared console glass surfaces', () => {
  let root: HTMLDivElement
  let stop: (() => void) | undefined
  beforeEach(() => {
    vi.clearAllMocks()
    attach.mockImplementation(() => ({ destroy, update: vi.fn() }))
    root = document.createElement('div')
    document.body.append(root)
  })
  afterEach(() => {
    stop?.()
    root.remove()
  })

  it('uses the homepage refraction engine once per outer panel, not nested rows', () => {
    root.innerHTML = '<div class="card"><div class="card"></div></div><div class="stat-card"></div>'
    stop = observeGlassSurfaces(root)
    expect(attach).toHaveBeenCalledTimes(2)
    expect(attach).toHaveBeenCalledWith(root.firstElementChild, { scale: 16, aberration: 0, mode: 'symmetric' })
  })

  it('handles asynchronous panels and disposes removed panels', async () => {
    stop = observeGlassSurfaces(root)
    const panel = document.createElement('div')
    panel.className = 'card'
    root.append(panel)
    await flushObserver()
    expect(attach).toHaveBeenCalledTimes(1)
    panel.remove()
    await flushObserver()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('leaves explicitly managed controls alone and cleans up on unmount', () => {
    root.innerHTML = '<div class="card"></div><div class="card"></div>'
    const explicit = root.lastElementChild as HTMLElement
    explicit.style.backdropFilter = 'url("#liquid-glass-refraction-manual")'
    stop = observeGlassSurfaces(root)
    expect(attach).toHaveBeenCalledTimes(1)
    stop()
    stop = undefined
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
