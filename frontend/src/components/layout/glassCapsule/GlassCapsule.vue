<template>
  <span
    ref="capsuleRef"
    class="glass-capsule"
    :class="{ 'glass-capsule-on': shown, 'glass-capsule-hot': hot }"
    :style="{ borderRadius: radius === 'pill' ? '9999px' : `${radius}px` }"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FRAME_ORDER, addFrameTask } from '../consoleFrame'
import { glassScene, type LensView } from '../glassScene'
import {
  PRESS_DEPTH,
  createMotion,
  lensScale,
  rememberMotion,
  resumeMotion,
  stepMotion,
  type LensMotion
} from './lensMotion'

/**
 * The spring glass selection capsule, placed as the first child of the container whose items it
 * moves between (the sidebar nav, the top bar toolbar, the site nav). The host says where it rests
 * (`rest`: the current page's item, an open menu's trigger) and which item a press lands on
 * (`pick`). It moves only on a press, never on hover: it glides there (resizing between items of
 * different size), squeezes while pressed and bounces back on release; while the pointer stays on
 * the container it keeps to the item just pressed, otherwise it goes to `rest`, or fades out.
 *
 * It sits behind the items (z-index -1 inside the container's stacking context), is positioned in
 * the container's content box, so it scrolls with the items and is clipped by the container, and
 * marks its item `data-capsule` (that item drops its own hover wash). Each place keeps its own
 * motion memory, so a capsule re-created by a page switch finishes the glide where it left off.
 * With `lensesField`, the field canvas behind the sidebar magnifies what lies under it.
 */
const props = withDefaults(
  defineProps<{
    rest: HTMLElement | null
    pick: (target: Element) => HTMLElement | null
    memoryKey: string
    radius?: number | 'pill'
    lensesField?: boolean
  }>(),
  { radius: 'pill', lensesField: false }
)

const capsuleRef = ref<HTMLElement | null>(null)
const shown = ref(false)
const hot = ref(false)
let container: HTMLElement | null = null
let motion: LensMotion | null = null
let lastTime = 0
let current: HTMLElement | null = null
let lastPressed: HTMLElement | null = null
let inside = false
let pressed = false

function render() {
  const el = capsuleRef.value
  if (!el || !motion) return
  const { sx, sy } = lensScale(motion)
  el.style.width = `${motion.w}px`
  el.style.height = `${motion.h}px`
  el.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
  if (props.lensesField) glassScene.invalidate()
}

const task = addFrameTask(FRAME_ORDER.lens, (now) => {
  const dt = lastTime ? Math.min(1 / 30, (now - lastTime) / 1000) : 1 / 60
  lastTime = now
  const moving = motion ? stepMotion(motion, dt) : false
  render()
  if (motion) rememberMotion(motion, performance.now(), props.memoryKey)
  if (!moving) lastTime = 0
  return moving
})

/** Box of `item` in the container's content coordinates; layout size ignores the press transform. */
function boxOf(item: HTMLElement) {
  const c = container!
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

function setCurrent(item: HTMLElement | null) {
  if (current === item) return
  if (current) delete current.dataset.capsule
  current = item
  if (current) current.dataset.capsule = ''
}

/** Sends the capsule to `item` (null fades it out); `jump` skips the glide. */
function aim(item: HTMLElement | null, jump = false) {
  setCurrent(item)
  if (!item || !container || !item.offsetWidth) {
    shown.value = false
    if (props.lensesField) glassScene.invalidate()
    return
  }
  const box = boxOf(item)
  let appearing = !shown.value
  if (!motion) {
    const resumed = resumeMotion(performance.now(), props.memoryKey)
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
  shown.value = true
  render()
  task.wake()
}

const settle = (jump = false) => aim((inside && lastPressed?.isConnected ? lastPressed : null) ?? props.rest, jump)

/** The capsule's box on screen, clipped to the container's visible band (for the field canvas). */
function view(): LensView | null {
  const el = capsuleRef.value
  if (!el || !container || !shown.value || !motion) return null
  const r = el.getBoundingClientRect()
  const band = container.getBoundingClientRect()
  const { sx, sy } = lensScale(motion)
  const radius = props.radius === 'pill' ? Math.min(r.width, r.height) / 2 : props.radius * Math.min(sx, sy)
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: radius, bandTop: band.top, bandBottom: band.bottom }
}

const onPointerDown = (event: PointerEvent) => {
  const item = props.pick(event.target as Element)
  if (event.button !== 0 || !item) return
  inside = true
  lastPressed = item
  aim(item)
  hot.value = true
  pressed = true
  if (motion) motion.tpress = PRESS_DEPTH
  task.wake()
}
const onPointerUp = () => {
  if (!pressed || !motion) return
  pressed = false
  motion.tpress = 1
  task.wake()
}
const onPointerOver = (event: PointerEvent) => {
  inside = true
  hot.value = !!current && props.pick(event.target as Element) === current
}
const onPointerLeave = () => {
  inside = false
  lastPressed = null
  hot.value = false
  settle()
}
const onScroll = () => {
  if (props.lensesField) glassScene.invalidate()
}
const onResize = () => settle(true)
let sizes: ResizeObserver | null = null

watch(() => props.rest, () => settle(), { flush: 'post' })

onMounted(() => {
  container = capsuleRef.value?.parentElement ?? null
  if (!container) return
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointerover', onPointerOver)
  container.addEventListener('pointerleave', onPointerLeave)
  container.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)
  // Collapsing the sidebar or a control changing width moves the items without a new `rest`.
  if (typeof ResizeObserver !== 'undefined') {
    sizes = new ResizeObserver(onResize)
    sizes.observe(container)
  }
  if (props.lensesField) glassScene.lens = view
  settle()
})

onBeforeUnmount(() => {
  container?.removeEventListener('pointerdown', onPointerDown)
  container?.removeEventListener('pointerover', onPointerOver)
  container?.removeEventListener('pointerleave', onPointerLeave)
  container?.removeEventListener('scroll', onScroll)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('resize', onResize)
  sizes?.disconnect()
  if (props.lensesField && glassScene.lens === view) glassScene.lens = null
  setCurrent(null)
  if (motion) rememberMotion(motion, performance.now(), props.memoryKey)
  task.remove()
})
</script>
