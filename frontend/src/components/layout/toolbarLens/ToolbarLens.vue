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
 * the same spring glass as the sidebar lens. It glides to the control under the pointer
 * (resizing on the way, as the controls differ in width), squeezes while pressed, and when the
 * pointer leaves it rests on the control whose menu is open or on the current page's link, or
 * fades out. It lives inside the toolbar, behind the controls and above the toolbar glass;
 * the controls' own hover backgrounds give way to it (style.css, [data-toolbar-lens]).
 */
const MEMORY_KEY = 'toolbar'

const lensRef = ref<HTMLElement | null>(null)
const shown = ref(false)
const hot = ref(false)
let motion: LensMotion | null = null
let lastTime = 0
let hovered: HTMLElement | null = null
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
  if (motion) rememberMotion(motion, performance.now(), MEMORY_KEY)
  if (!moving) lastTime = 0
  return moving
})

/** Box of `target` in toolbar coordinates; layout size ignores the press transform on it. */
function boxOf(toolbar: HTMLElement, target: HTMLElement) {
  const t = target.getBoundingClientRect()
  const b = toolbar.getBoundingClientRect()
  const w = target.offsetWidth
  const h = target.offsetHeight
  return { x: t.left + t.width / 2 - w / 2 - b.left, y: t.top + t.height / 2 - h / 2 - b.top, w, h }
}

/** Sends the capsule to `target` (null hides it); `jump` skips the glide. */
function aim(toolbar: HTMLElement, target: HTMLElement | null, jump = false) {
  if (!target) {
    shown.value = false
    return
  }
  const box = boxOf(toolbar, target)
  let appearing = !shown.value
  if (!motion) {
    // A new layout after navigation: continue the previous capsule mid-flight.
    const resumed = resumeMotion(performance.now(), MEMORY_KEY)
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
  const visible = () => targets.filter((el) => el.offsetWidth > 0)
  const settle = () => aim(toolbar, hovered ?? restTarget(visible()))
  const refresh = () => {
    targets = toolbarTargets(toolbar)
    for (const el of targets) if (!('toolbarLens' in el.dataset)) el.dataset.toolbarLens = ''
    if (hovered && !toolbar.contains(hovered)) hovered = null
    settle()
  }
  const targetOf = (event: Event) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>('a[href], button')
    return el && targets.includes(el) ? el : null
  }

  const onPointerOver = (event: PointerEvent) => {
    const target = targetOf(event)
    if (!target || target === hovered) return
    hovered = target
    hot.value = true
    aim(toolbar, target)
  }
  const onPointerLeave = () => {
    hovered = null
    hot.value = false
    settle()
  }
  const onPointerDown = (event: PointerEvent) => {
    const target = targetOf(event)
    if (event.button !== 0 || !target) return
    hovered = target
    hot.value = true
    aim(toolbar, target)
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
  const onResize = () => aim(toolbar, hovered ?? restTarget(visible()), true)

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
  }
}

onMounted(() => {
  const toolbar = lensRef.value?.parentElement
  if (toolbar) cleanup = attach(toolbar)
})

onBeforeUnmount(() => {
  cleanup?.()
  cleanup = null
  if (motion) rememberMotion(motion, performance.now(), MEMORY_KEY)
  task.remove()
})
</script>
