import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, withDirectives, type Ref } from 'vue'
import { mount } from '@vue/test-utils'

const { attach } = vi.hoisted(() => ({ attach: vi.fn() }))
vi.mock('../refraction', () => ({ attachRefraction: attach }))

import { vLiquidGlass, type LiquidGlassBinding } from '../vLiquidGlass'

/** A media query whose state the test flips; counts its listeners. */
function fakeMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initial,
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
  }
  return {
    listeners,
    set(matches: boolean) {
      query.matches = matches
      listeners.forEach((fn) => fn())
    },
    install() {
      return vi.spyOn(window, 'matchMedia').mockImplementation(() => query as unknown as MediaQueryList)
    },
  }
}

function controller() {
  return { update: vi.fn(), destroy: vi.fn() }
}

function host(options: Ref<LiquidGlassBinding>) {
  return mount(defineComponent({ setup: () => () => withDirectives(h('div'), [[vLiquidGlass, options.value]]) }))
}

const DESKTOP = '(min-width: 1024px)'

describe('v-liquid-glass media gating', () => {
  beforeEach(() => attach.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('attaches the lens only while the media query matches', () => {
    const media = fakeMedia(false)
    const spy = media.install()
    const first = controller()
    const second = controller()
    attach.mockReturnValueOnce(first).mockReturnValueOnce(second)

    host(ref<LiquidGlassBinding>({ scale: 10, media: DESKTOP }))
    expect(spy).toHaveBeenCalledWith(DESKTOP)
    expect(attach).not.toHaveBeenCalled()

    media.set(true)
    expect(attach).toHaveBeenCalledTimes(1)
    // The media key is the directive's own; the lens gets only its options.
    expect(attach.mock.calls[0][1]).toEqual({ scale: 10 })

    media.set(false)
    expect(first.destroy).toHaveBeenCalledTimes(1)

    media.set(true)
    expect(attach).toHaveBeenCalledTimes(2)
    expect(second.destroy).not.toHaveBeenCalled()
  })

  it('keeps the lens always on without a media query', () => {
    const spy = vi.spyOn(window, 'matchMedia')
    attach.mockReturnValue(controller())
    host(ref<LiquidGlassBinding>({ scale: 10 }))
    expect(attach).toHaveBeenCalledTimes(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('updates an attached lens in place and cleans up on unmount', async () => {
    const media = fakeMedia(true)
    media.install()
    const lens = controller()
    attach.mockReturnValue(lens)
    const options = ref<LiquidGlassBinding>({ scale: 10, media: DESKTOP })
    const wrapper = host(options)
    expect(media.listeners.size).toBe(1)

    options.value = { scale: 20, media: DESKTOP }
    await nextTick()
    expect(attach).toHaveBeenCalledTimes(1)
    expect(lens.update).toHaveBeenCalledWith({ scale: 20 })

    wrapper.unmount()
    expect(lens.destroy).toHaveBeenCalledTimes(1)
    expect(media.listeners.size).toBe(0)
  })
})
