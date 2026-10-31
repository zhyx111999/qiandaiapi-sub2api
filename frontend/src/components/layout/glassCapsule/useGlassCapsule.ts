import { onBeforeUnmount, onMounted, onUpdated, reactive, watch, type ComponentPublicInstance, type Ref } from 'vue'
import { FRAME_ORDER, addFrameTask } from '../consoleFrame'
import type { GlassScene, LensView } from '../glassScene'
import {
  PRESS_DEPTH,
  createMotion,
  lensScale,
  rememberMotion,
  resumeMotion,
  stepMotion,
  type LensMotion
} from './lensMotion'

export interface GlassCapsuleOptions {
  /** The element the items sit in; the capsule is the first child and moves in its content box. */
  container: Ref<HTMLElement | null>
  /** Keys a press can land on. */
  pressable: () => readonly string[]
  /** The element of an item key. */
  element: (key: string) => HTMLElement | null | undefined
  /** Where it rests when no press holds it (the current page's item, an open menu's trigger). */
  rest: () => string | null
  /** Motion memory slot: a capsule re-created by a page switch finishes the glide. */
  memoryKey: string
  radius?: number | 'pill'
  /** With a scene, the field canvas magnifies what lies under the capsule. */
  scene?: GlassScene | null
}

export interface CapsuleHandle {
  /** The item it is on (the host marks it `data-capsule`), whether it shows, whether it glows. */
  readonly state: { readonly at: string | null; readonly shown: boolean; readonly hot: boolean }
  readonly radius: number | 'pill'
  /** Function ref of the capsule element (GlassCapsule.vue). */
  bind: (el: Element | ComponentPublicInstance | null) => void
  /** Listeners for the container (`v-on="capsule.on"`). */
  on: {
    pointerdown: (event: PointerEvent) => void
    pointerover: (event: PointerEvent) => void
    pointerleave: () => void
    scroll: () => void
  }
}

/**
 * The spring glass selection capsule of a list of items (the sidebar nav, the top bar toolbar, the
 * site nav). The host says where it rests and which items a press can land on, binds `on` to its
 * container and renders <GlassCapsule :capsule> as the container's first child.
 *
 * It moves only on a press, never on hover: it glides there (resizing between items of different
 * size), squeezes while pressed and bounces back on release; while the pointer stays on the
 * container it keeps to the item just pressed, otherwise it goes to `rest`, or fades out. It is
 * re-placed whenever the host re-renders (a group opening above it) or the container resizes
 * (the sidebar collapsing). Positioned in the container's content box, it scrolls with the items
 * and is clipped by the container.
 */
export function useGlassCapsule(options: GlassCapsuleOptions): CapsuleHandle {
  const radius = options.radius ?? 'pill'
  const state = reactive({ at: null as string | null, shown: false, hot: false })
  let el: HTMLElement | null = null
  let motion: LensMotion | null = null
  let lastTime = 0
  let pressedKey: string | null = null
  let inside = false
  let pressing = false

  function render() {
    if (!el || !motion) return
    const { sx, sy } = lensScale(motion)
    el.style.width = `${motion.w}px`
    el.style.height = `${motion.h}px`
    el.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
    options.scene?.invalidate()
  }

  const task = addFrameTask(FRAME_ORDER.lens, (now) => {
    const dt = lastTime ? Math.min(1 / 30, (now - lastTime) / 1000) : 1 / 60
    lastTime = now
    const moving = motion ? stepMotion(motion, dt) : false
    render()
    if (motion) rememberMotion(motion, performance.now(), options.memoryKey)
    if (!moving) lastTime = 0
    return moving
  })

  /** Box of `item` in the container's content coordinates; layout size ignores the press transform. */
  function boxOf(item: HTMLElement, c: HTMLElement) {
    const t = item.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    const w = item.offsetWidth
    const h = item.offsetHeight
    return {
      x: t.left + t.width / 2 - w / 2 - b.left - c.clientLeft + c.scrollLeft,
      y: t.top + t.height / 2 - h / 2 - b.top - c.clientTop + c.scrollTop,
      w,
      h,
    }
  }

  /** Sends the capsule to `key` (null or an item off screen fades it out); `jump` skips the glide. */
  function aim(key: string | null, jump = false) {
    const c = options.container.value
    const item = key ? options.element(key) : null
    if (!c || !item || !item.offsetWidth) {
      state.at = null
      state.shown = false
      options.scene?.invalidate()
      return
    }
    state.at = key
    const box = boxOf(item, c)
    let appearing = !state.shown
    if (!motion) {
      const resumed = resumeMotion(performance.now(), options.memoryKey)
      motion = resumed ?? createMotion(box.x, box.y, box.w, box.h)
      motion.tpress = 1
      if (resumed) appearing = false
    }
    motion.tx = box.x
    motion.ty = box.y
    motion.tw = box.w
    motion.th = box.h
    if (jump || appearing) {
      // Out of nowhere it appears in place; only a visible capsule glides.
      motion.x = box.x
      motion.y = box.y
      motion.w = box.w
      motion.h = box.h
      motion.vx = motion.vy = motion.vw = motion.vh = 0
    }
    state.shown = true
    render()
    task.wake()
  }

  function settle(jump = false) {
    const held = inside && pressedKey && options.element(pressedKey) ? pressedKey : null
    aim(held ?? options.rest(), jump)
  }

  const keyAt = (target: EventTarget | null) =>
    target instanceof Node ? (options.pressable().find((key) => options.element(key)?.contains(target)) ?? null) : null

  /** The capsule's box on screen, clipped to the container's visible band (for the field canvas). */
  function view(): LensView | null {
    const c = options.container.value
    if (!el || !c || !state.shown || !motion) return null
    const r = el.getBoundingClientRect()
    const band = c.getBoundingClientRect()
    const { sx, sy } = lensScale(motion)
    const corner = radius === 'pill' ? Math.min(r.width, r.height) / 2 : radius * Math.min(sx, sy)
    return { x: r.left, y: r.top, w: r.width, h: r.height, r: corner, bandTop: band.top, bandBottom: band.bottom }
  }

  const on = {
    pointerdown(event: PointerEvent) {
      const key = keyAt(event.target)
      if (event.button !== 0 || !key) return
      inside = true
      pressedKey = key
      aim(key)
      state.hot = true
      pressing = true
      if (motion) motion.tpress = PRESS_DEPTH
      task.wake()
    },
    pointerover(event: PointerEvent) {
      inside = true
      state.hot = state.at !== null && keyAt(event.target) === state.at
    },
    pointerleave() {
      inside = false
      pressedKey = null
      state.hot = false
      settle()
    },
    scroll() {
      options.scene?.invalidate()
    },
  }

  function release() {
    if (!pressing || !motion) return
    pressing = false
    motion.tpress = 1
    task.wake()
  }

  // The container can come and go with the host's own v-if (the site nav off the login page).
  let sizes: ResizeObserver | null = null
  watch(
    options.container,
    (c) => {
      sizes?.disconnect()
      sizes = null
      if (!c) {
        state.at = null
        state.shown = false
        return
      }
      if (typeof ResizeObserver !== 'undefined') {
        sizes = new ResizeObserver(() => settle(true))
        sizes.observe(c)
      }
      settle()
    },
    { flush: 'post' }
  )
  watch(options.rest, () => settle(), { flush: 'post' })
  onUpdated(() => settle())

  onMounted(() => {
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    options.scene?.setLens(view)
    settle()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
    sizes?.disconnect()
    options.scene?.setLens(null)
    if (motion) rememberMotion(motion, performance.now(), options.memoryKey)
    task.remove()
  })

  return {
    state,
    radius,
    bind(node) {
      el = node instanceof HTMLElement ? node : null
    },
    on,
  }
}

/**
 * Template refs of a list of items by key: `:ref="items.ref(key)"` (a component resolves to its root
 * element). One stable setter per key, so re-renders do not churn the refs.
 */
export function useItemRefs() {
  const elements = new Map<string, HTMLElement>()
  const setters = new Map<string, (el: Element | ComponentPublicInstance | null) => void>()
  return {
    get: (key: string) => elements.get(key) ?? null,
    keys: () => [...elements.keys()],
    ref(key: string) {
      let set = setters.get(key)
      if (!set) {
        set = (el) => {
          const node = el && '$el' in el ? el.$el : el
          if (node instanceof HTMLElement) elements.set(key, node)
          else elements.delete(key)
        }
        setters.set(key, set)
      }
      return set
    },
  }
}
