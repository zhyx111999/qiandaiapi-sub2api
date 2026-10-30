<template>
  <span
    ref="lensRef"
    class="console-toolbar-lens"
    :class="{ 'console-toolbar-lens-on': shown, 'console-toolbar-lens-hot': hot }"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FRAME_ORDER, addFrameTask } from '../consoleFrame'
import {
  PRESS_DEPTH,
  createMotion,
  lensScale,
  rememberMotion,
  resumeMotion,
  stepMotion,
  type LensMotion
} from '../sidebarLens/lensMotion'
import { restTarget, toolbarTargets } from './toolbarTargets'

/**
 * The selection capsule of the top bar's controls (model plaza, language, the user menu, ...):
 * the same spring glass as the sidebar lens, and it moves the same way: only when a control is
 * pressed, never on mere hover. It glides there (resizing on the way, as the controls differ in
 * width), squeezes while pressed and bounces back on release. Otherwise it rests on the control
 * whose menu is open, else on the current page's link, else on the control just pressed while the
 * pointer stays on the toolbar; with none of those it fades out. Hovering a control gives it a light
 * wash; hovering the one under the capsule makes the capsule glow (style.css, [data-toolbar-lens]).
 * It lives inside the toolbar, behind the controls and above the toolbar glass.
 * The cover's nav pill reuses it; each place keeps its own motion memory (`memoryKey`).
 */
const props = withDefaults(defineProps<{ memoryKey?: string }>(), { memoryKey: 'toolbar' })

const lensRef = ref<HTMLElement | null>(null)
const shown = ref(false)
const hot = ref(false)
let motion: LensMotion | null = null
let lastTime = 0
/** The control the capsule sits on (marked data-toolbar-lens="on"). */
let current: HTMLElement | null = null
let pressed = false
let cleanup: (() => void) | null = null

function render() {
  const el = lensRef.value
  if (!el || !motion) return
  const { sx, sy } = lensScale(motion)
  el.style.width = `${motion.w}px`
  el.style.height = `${motion.h}px`
  el.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
}

const task = addFrameTask(FRAME_ORDER.toolbar, (now) => {
  const dt = lastTime ? Math.min(1 / 30, (now - lastTime) / 1000) : 1 / 60
  lastTime = now
  const moving = motion ? stepMotion(motion, dt) : false
  render()
  if (motion) rememberMotion(motion, performance.now(), props.memoryKey)
  if (!moving) lastTime = 0
  return moving
})

/**
 * Box of `target` in the coordinates the capsule is positioned in (the toolbar's padding box,
 * so inside its border); layout size ignores the press transform on the target.
 */
function boxOf(toolbar: HTMLElement, target: HTMLElement) {
  const t = target.getBoundingClientRect()
  const b = toolbar.getBoundingClientRect()
  const w = target.offsetWidth
  const h = target.offsetHeight
  return {
    x: t.left + t.width / 2 - w / 2 - b.left - toolbar.clientLeft,
    y: t.top + t.height / 2 - h / 2 - b.top - toolbar.clientTop,
    w,
    h,
  }
}

function setCurrent(target: HTMLElement | null) {
  if (current === target) return
  if (current) current.dataset.toolbarLens = ''
  current = target
  if (current) current.dataset.toolbarLens = 'on'
}

/** Sends the capsule to `target` (null hides it); `jump` skips the glide. */
function aim(toolbar: HTMLElement, target: HTMLElement | null, jump = false) {
  setCurrent(target)
  if (!target) {
    shown.value = false
    return
  }
  const box = boxOf(toolbar, target)
  let appearing = !shown.value
  if (!motion) {
    // A new layout after navigation: continue the previous capsule mid-flight.
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

function attach(toolbar: HTMLElement) {
  let targets: HTMLElement[] = []
  /** The control pressed last; the capsule stays on it while the pointer is on the toolbar. */
  let lastPressed: HTMLElement | null = null
  let inside = false
  const visible = () => targets.filter((el) => el.offsetWidth > 0)
  const resting = () => restTarget(visible()) ?? (inside ? lastPressed : null)
  const settle = (jump = false) => aim(toolbar, resting(), jump)
  const refresh = () => {
    targets = toolbarTargets(toolbar)
    for (const el of targets) if (!('toolbarLens' in el.dataset)) el.dataset.toolbarLens = ''
    if (lastPressed && !targets.includes(lastPressed)) lastPressed = null
    settle()
  }
  const targetOf = (event: Event) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>('a[href], button')
    return el && targets.includes(el) ? el : null
  }

  // Hover never moves the capsule; it only makes it glow over its own control.
  const onPointerOver = (event: PointerEvent) => {
    inside = true
    hot.value = !!current && targetOf(event) === current
  }
  const onPointerLeave = () => {
    inside = false
    lastPressed = null
    hot.value = false
    settle()
  }
  const onPointerDown = (event: PointerEvent) => {
    const target = targetOf(event)
    if (event.button !== 0 || !target) return
    inside = true
    lastPressed = target
    aim(toolbar, target)
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
  const onResize = () => settle(true)

  // Controls come and go (user loaded, menus opening, the active link changing).
  const mutations = new MutationObserver(refresh)
  mutations.observe(toolbar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
  sizes?.observe(toolbar)
  toolbar.addEventListener('pointerover', onPointerOver)
  toolbar.addEventListener('pointerleave', onPointerLeave)
  toolbar.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)
  refresh()

  return () => {
    mutations.disconnect()
    sizes?.disconnect()
    toolbar.removeEventListener('pointerover', onPointerOver)
    toolbar.removeEventListener('pointerleave', onPointerLeave)
    toolbar.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('resize', onResize)
    setCurrent(null)
  }
}

onMounted(() => {
  const toolbar = lensRef.value?.parentElement
  if (toolbar) cleanup = attach(toolbar)
})

onBeforeUnmount(() => {
  cleanup?.()
  cleanup = null
  if (motion) rememberMotion(motion, performance.now(), props.memoryKey)
  task.remove()
})
</script>
