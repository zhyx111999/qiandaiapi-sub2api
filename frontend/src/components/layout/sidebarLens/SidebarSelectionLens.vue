<template>
  <div
    v-show="visible"
    ref="lensRef"
    v-liquid-glass="LENS_GLASS"
    class="sidebar-lens"
    aria-hidden="true"
  ></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import { LENS_GLASS } from '../consoleGlass'
import { PRESS_DEPTH, createMotion, lensScale, rememberMotion, resumeMotion, stepMotion, type LensMotion } from './lensMotion'

/**
 * Liquid-glass capsule over the active sidebar item. It is a sibling of the sidebar (not a
 * child), so its backdrop holds the sidebar, the field behind it and the label it refracts.
 * The sidebar markup is untouched: the lens finds `.sidebar-link-active` inside `nav` and
 * follows it through scrolling, collapsing, group expansion and route changes.
 *
 * Motion runs in the nav's content coordinates, so scrolling never disturbs a flight and a
 * flight resumed in the next layout does not depend on when that layout restores its scroll.
 */
const props = defineProps<{ nav: HTMLElement | null }>()

const SHADOW_ROOM = 24 // px kept outside unclipped edges so the drop shadow survives

const lensRef = ref<HTMLElement | null>(null)
const visible = ref(false)
let motion: LensMotion | null = null
let raf = 0
let lastTime = 0
let pressed = false
let detach: (() => void) | null = null
/** Viewport position of the nav's content origin, and the nav's visible band. */
let frame = { left: 0, top: 0, bandTop: -Infinity, bandBottom: Infinity }
let lensHeight = 0

function activeLink(nav: HTMLElement): HTMLElement | null {
  return nav.querySelector<HTMLElement>('.sidebar-link-active')
}

function measure(nav: HTMLElement) {
  const rect = nav.getBoundingClientRect()
  frame = { left: rect.left, top: rect.top - nav.scrollTop, bandTop: rect.top, bandBottom: rect.bottom }
}

/** Link box in content coordinates; layout size ignores the press transform on the link. */
function targetOf(link: HTMLElement) {
  const rect = link.getBoundingClientRect()
  const w = link.offsetWidth
  const h = link.offsetHeight
  return { x: rect.left + rect.width / 2 - w / 2 - frame.left, y: rect.top + rect.height / 2 - h / 2 - frame.top, w, h }
}

function render() {
  const el = lensRef.value
  if (!el || !motion) return
  const x = frame.left + motion.x
  const y = frame.top + motion.y
  const { sx, sy } = lensScale(motion)
  el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
  // The lens floats above the sidebar, so it is clipped by hand where the nav scrolls its item
  // under the brand plate or the bottom bar.
  const clipTop = frame.bandTop - y
  const clipBottom = y + lensHeight - frame.bandBottom
  el.style.clipPath =
    clipTop > 0 || clipBottom > 0
      ? `inset(${clipTop > 0 ? clipTop : -SHADOW_ROOM}px ${-SHADOW_ROOM}px ${clipBottom > 0 ? clipBottom : -SHADOW_ROOM}px ${-SHADOW_ROOM}px)`
      : ''
}

function tick(now: number) {
  raf = 0
  if (!motion) return
  const dt = lastTime ? Math.min(1 / 30, (now - lastTime) / 1000) : 1 / 60
  lastTime = now
  const moving = stepMotion(motion, dt)
  render()
  rememberMotion(motion, performance.now())
  if (moving) raf = requestAnimationFrame(tick)
}

function animate() {
  if (raf) return
  lastTime = 0
  raf = requestAnimationFrame(tick)
}

/** Aims the lens at `link` inside `nav`; `jump` skips the travel (collapsing, resizing). */
function aim(nav: HTMLElement, link: HTMLElement | null, jump: boolean) {
  const el = lensRef.value
  if (!link || !el) {
    visible.value = false
    return
  }
  measure(nav)
  const target = targetOf(link)
  lensHeight = target.h
  el.style.width = `${target.w}px`
  el.style.height = `${target.h}px`
  visible.value = true
  if (!motion) {
    // A new layout after navigation: continue the previous lens mid-flight. The pointer
    // cannot still be held across a navigation, so the press always springs back.
    const resumed = resumeMotion(performance.now())
    motion = resumed ?? createMotion(target.x, target.y)
    motion.tpress = 1
    if (resumed) jump = false
  }
  motion.tx = target.x
  motion.ty = target.y
  if (jump) {
    motion.x = target.x
    motion.y = target.y
    motion.vx = 0
    motion.vy = 0
  }
  render()
  animate()
}

/** Wires the lens to `nav`; called after mount and whenever the nav element changes. */
function attach(nav: HTMLElement | null) {
  detach?.()
  detach = null
  if (!nav || !lensRef.value) return
  const place = (jump: boolean) => aim(nav, activeLink(nav), jump)

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !motion) return
    const link = (event.target as Element | null)?.closest<HTMLElement>('.sidebar-link')
    if (!link) return
    pressed = true
    setHot(true)
    // Route links move the lens on press; group headers only expand, so they just squeeze it.
    if (link.tagName === 'A') aim(nav, link, false)
    motion.tpress = PRESS_DEPTH
    animate()
  }
  const onPointerUp = () => {
    if (!pressed || !motion) return
    pressed = false
    motion.tpress = 1
    animate()
  }
  const onPointerOver = (event: PointerEvent) => {
    const link = (event.target as Element | null)?.closest('.sidebar-link')
    setHot(!!link && link.classList.contains('sidebar-link-active'))
  }
  const onPointerLeave = () => setHot(false)
  const onScroll = () => {
    measure(nav)
    render()
  }
  const onResize = () => place(true)
  // The phone drawer slides with a transform, which no observer reports: track it per frame.
  const aside = nav.closest<HTMLElement>('.sidebar')
  let slide = 0
  const followSlide = () => {
    place(true)
    slide = requestAnimationFrame(followSlide)
  }
  const isSlide = (event: TransitionEvent) => event.target === aside && event.propertyName === 'transform'
  const onSlideStart = (event: TransitionEvent) => {
    if (isSlide(event) && !slide) slide = requestAnimationFrame(followSlide)
  }
  const onSlideEnd = (event: TransitionEvent) => {
    if (!isSlide(event)) return
    cancelAnimationFrame(slide)
    slide = 0
    place(true)
  }

  // Collapse/expand animates the sidebar width; group expansion and active changes flip classes.
  // The observer also fires once on observe: ignore it, or it would cut a resumed flight short.
  let observedWidth = nav.offsetWidth
  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (nav.offsetWidth === observedWidth) return
          observedWidth = nav.offsetWidth
          place(true)
        })
  resizeObserver?.observe(nav)
  const mutationObserver = new MutationObserver(() => place(false))
  mutationObserver.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  nav.addEventListener('scroll', onScroll, { passive: true })
  nav.addEventListener('pointerdown', onPointerDown)
  nav.addEventListener('pointerover', onPointerOver)
  nav.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)
  aside?.addEventListener('transitionrun', onSlideStart)
  aside?.addEventListener('transitionend', onSlideEnd)
  aside?.addEventListener('transitioncancel', onSlideEnd)
  place(false)

  detach = () => {
    resizeObserver?.disconnect()
    mutationObserver.disconnect()
    nav.removeEventListener('scroll', onScroll)
    nav.removeEventListener('pointerdown', onPointerDown)
    nav.removeEventListener('pointerover', onPointerOver)
    nav.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('resize', onResize)
    aside?.removeEventListener('transitionrun', onSlideStart)
    aside?.removeEventListener('transitionend', onSlideEnd)
    aside?.removeEventListener('transitioncancel', onSlideEnd)
    cancelAnimationFrame(slide)
  }
}

function setHot(on: boolean) {
  lensRef.value?.classList.toggle('sidebar-lens-hot', on)
}

onMounted(() => attach(props.nav))
watch(
  () => props.nav,
  (nav) => attach(nav)
)

onBeforeUnmount(() => {
  detach?.()
  detach = null
  if (motion) rememberMotion(motion, performance.now())
  if (raf) cancelAnimationFrame(raf)
})
</script>
