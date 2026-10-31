import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import GlassCapsule from '../GlassCapsule.vue'
import { useGlassCapsule, useItemRefs, type CapsuleHandle } from '../useGlassCapsule'

const KEYS = ['a', 'b', 'c'] as const
const rest = ref<string | null>('a')
const shown = ref(true)
let capsule: CapsuleHandle

/** A host as the sidebar, toolbar and site nav are: its own container, keyed items, `v-on` listeners. */
const Host = defineComponent({
  setup() {
    const container = ref<HTMLElement | null>(null)
    const items = useItemRefs()
    capsule = useGlassCapsule({
      container,
      pressable: () => items.keys().filter((key) => key !== 'c'),
      element: items.get,
      rest: () => rest.value,
      memoryKey: 'spec',
    })
    return () =>
      shown.value
        ? h('nav', { ref: container, ...vOn(capsule.on) }, [
            h(GlassCapsule, { capsule }),
            ...KEYS.map((key) =>
              h('button', { ref: items.ref(key), id: key, 'data-capsule': capsule.state.at === key ? '' : undefined }, key)
            ),
          ])
        : null
  },
})
const vOn = (on: CapsuleHandle['on']) => ({
  onPointerdown: on.pointerdown,
  onPointerover: on.pointerover,
  onPointerleave: on.pointerleave,
  onScroll: on.scroll,
})

// jsdom may lack PointerEvent; the listeners only read `button` and `target`.
const pointer = (type: string) => new MouseEvent(type, { bubbles: true, button: 0 })
let wrapper: VueWrapper

beforeEach(async () => {
  rest.value = 'a'
  shown.value = true
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(40)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(32)
  wrapper = mount(Host, { attachTo: document.body })
  await nextTick()
})

afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useGlassCapsule', () => {
  it('rests on the item the host names, and follows it', async () => {
    expect(capsule.state.at).toBe('a')
    expect(capsule.state.shown).toBe(true)
    expect(wrapper.find('#a').attributes('data-capsule')).toBe('')
    rest.value = 'b'
    await nextTick()
    await nextTick()
    expect(capsule.state.at).toBe('b')
    expect(wrapper.find('#a').attributes('data-capsule')).toBeUndefined()
  })

  it('fades out when nothing is named', async () => {
    rest.value = null
    await nextTick()
    await nextTick()
    expect(capsule.state.at).toBeNull()
    expect(capsule.state.shown).toBe(false)
  })

  it('goes to a pressed item and keeps to it while the pointer stays, then returns to rest', async () => {
    wrapper.find('#b').element.dispatchEvent(pointer('pointerdown'))
    expect(capsule.state.at).toBe('b')
    expect(capsule.state.hot).toBe(true)
    window.dispatchEvent(pointer('pointerup'))
    wrapper.find('#a').element.dispatchEvent(pointer('pointerover'))
    expect(capsule.state.at).toBe('b')
    expect(capsule.state.hot).toBe(false)
    wrapper.find('nav').element.dispatchEvent(new MouseEvent('pointerleave'))
    expect(capsule.state.at).toBe('a')
  })

  it('ignores a press on an item that is not pressable', () => {
    wrapper.find('#c').element.dispatchEvent(pointer('pointerdown'))
    expect(capsule.state.at).toBe('a')
    expect(capsule.state.hot).toBe(false)
  })

  it('goes away with its container and comes back in place', async () => {
    shown.value = false
    await nextTick()
    await nextTick()
    expect(capsule.state.shown).toBe(false)
    expect(capsule.state.at).toBeNull()
    shown.value = true
    await nextTick()
    await nextTick()
    expect(capsule.state.at).toBe('a')
    expect(capsule.state.shown).toBe(true)
  })
})
