<template>
  <canvas
    ref="canvasRef"
    class="console-strands"
    :class="{ 'console-strands-drawer': phone, 'console-strands-open': phone && drawerOpen }"
    aria-hidden="true"
  ></canvas>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores'
import { createStrands } from '@/components/home/landing/convergence/strands'
import { FLOW, consoleFlow, frameDue, stepFlow } from './consoleFlow'
import { DESKTOP_MIN_WIDTH } from './consoleGlass'
import { FRAME_ORDER, addFrameTask } from './consoleFrame'
import { FieldPainter } from './fieldPainter'
import { glassScene } from './glassScene'
import type { GlassRect } from './glassOptics'

/**
 * The living field behind the floating glass sidebar, and the glass optics drawn into it.
 * Clear glass over still paper reads as a plain panel; motion behind it is what makes the
 * sidebar read as liquid glass. The sidebar's edge lensing and the capsule's magnification are
 * painted here (FieldPainter), so neither carries a live backdrop filter that the browser would
 * have to recompute every frame the field moves.
 *
 * Runs on the shared console frame loop, capped at 60 fps (FLOW.maxFps); a capsule move redraws
 * at once. Pauses with the hidden tab like any rAF loop; with prefers-reduced-motion it draws
 * still frames only.
 *
 * Desktop: the field lies beside the sidebar and fades out before the workspace. Phone: the
 * sidebar is a drawer, so the field spans the screen above the drawer's veil only while the
 * drawer is open, and stops once it has faded out.
 */
const props = defineProps<{
  /** The sidebar the field is seen through (AppLayout passes AppSidebar's aside). */
  sidebar: HTMLElement | null
}>()

const STRAND_COUNT = 30
const FIELD_WIDTH = 640 // px of field from the left edge on desktop
const FADE_FROM = { desktop: 0.45, drawer: 0.7 } // fraction of the width where the fade-out starts
const DRAWER_FADE_MS = 300 // matches the canvas opacity transition below
const SIDEBAR_RADIUS = 24 // .sidebar border-radius

/** Deterministic layout so the field does not change between pages. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const media = (query: string) => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
const reducedMotion = media('(prefers-reduced-motion: reduce)')
const reducedTransparency = media('(prefers-reduced-transparency: reduce)') // the sidebar is solid then

const appStore = useAppStore()
const drawerOpen = computed(() => appStore.mobileOpen)
const phone = ref(typeof window !== 'undefined' && window.innerWidth < DESKTOP_MIN_WIDTH)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const painter = new FieldPainter(createStrands(STRAND_COUNT, seeded(20261027)))
let ctx: CanvasRenderingContext2D | null = null
let reach = 0
let height = 0
let lastTime = 0
let lensMoved = false
let drawerFade = 0 // timer while the closed drawer's field fades out
let themeObserver: MutationObserver | null = null
let sidebarObserver: ResizeObserver | null = null

/** Desktop: beside the sidebar. Phone: the full width while the drawer is open or fading out. */
function fieldWidth(): number {
  if (!phone.value) return Math.min(FIELD_WIDTH, window.innerWidth * 0.5)
  return drawerOpen.value || drawerFade ? window.innerWidth : 0
}

function resize() {
  const canvas = canvasRef.value
  ctx = canvas?.getContext('2d') ?? null
  if (!canvas || !ctx) return
  phone.value = window.innerWidth < DESKTOP_MIN_WIDTH
  reach = fieldWidth()
  height = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.style.width = `${reach}px`
  canvas.style.height = `${height}px`
  canvas.width = Math.round(reach * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** The sidebar as the field sees it this frame, or null when it is off the field (closed drawer). */
function glassRect(): GlassRect | null {
  if (!props.sidebar || reducedTransparency) return null
  const r = props.sidebar.getBoundingClientRect()
  if (r.right <= 0 || r.left >= reach) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: SIDEBAR_RADIUS }
}

function draw() {
  if (!ctx || !reach || !height) return
  const glass = glassRect()
  painter.paint(ctx, {
    width: reach,
    height,
    dark: document.documentElement.classList.contains('dark'),
    waveTime: consoleFlow.waveTime,
    glowTime: consoleFlow.glowTime,
    pulses: consoleFlow.pulses.pulses,
    pulseTail: FLOW.pulseTail,
    fadeFrom: phone.value ? FADE_FROM.drawer : FADE_FROM.desktop,
    glass,
    lens: glass ? (glassScene.lens?.() ?? null) : null,
  })
}

const task = addFrameTask(FRAME_ORDER.field, (now) => {
  if (!reach) {
    lastTime = 0
    return false
  }
  const lensStep = lensMoved
  lensMoved = false
  if (reducedMotion) {
    draw()
    return false
  }
  if (lastTime && !frameDue(now, lastTime) && !lensStep) return true
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0
  lastTime = now
  stepFlow(consoleFlow, dt, reach, STRAND_COUNT)
  draw()
  return true
})

/** Re-sizes for the current viewport and drawer state; the loop stops by itself at width 0. */
function refresh() {
  resize()
  draw()
  task.wake()
}

watch(drawerOpen, (open) => {
  window.clearTimeout(drawerFade)
  drawerFade = 0
  if (!open && phone.value) {
    drawerFade = window.setTimeout(() => {
      drawerFade = 0
      refresh()
    }, DRAWER_FADE_MS)
  }
  refresh()
})

// Collapsing changes the glass; redraw even when the field itself is still (reduced motion).
watch(
  () => props.sidebar,
  (el) => {
    sidebarObserver?.disconnect()
    sidebarObserver = null
    if (el && typeof ResizeObserver !== 'undefined') {
      sidebarObserver = new ResizeObserver(() => task.wake())
      sidebarObserver.observe(el)
    }
    task.wake()
  },
  { immediate: true }
)

onMounted(() => {
  glassScene.invalidate = () => {
    lensMoved = true
    task.wake()
  }
  refresh()
  window.addEventListener('resize', refresh)
  themeObserver = new MutationObserver(draw)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  task.remove()
  glassScene.invalidate = () => {}
  window.clearTimeout(drawerFade)
  window.removeEventListener('resize', refresh)
  themeObserver?.disconnect()
  themeObserver = null
  sidebarObserver?.disconnect()
  sidebarObserver = null
})
</script>

<style scoped>
.console-strands {
  position: fixed;
  top: 0;
  left: 0;
  display: block;
  pointer-events: none;
}

/* Phone: above the drawer's veil (z 35) and below the drawer (z 40), fading with the veil. */
.console-strands-drawer {
  z-index: 36;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.console-strands-open {
  opacity: 1;
}
</style>
