<template>
  <div
    v-show="size.w > 0"
    class="console-field"
    :class="{ 'console-field-drawer': phone, 'console-field-open': phone && drawerOpen }"
    :style="{ width: `${size.w}px`, height: `${size.h}px`, '--field-fade': `${(phone ? FADE_FROM.drawer : FADE_FROM.desktop) * 100}%` }"
    aria-hidden="true"
  >
    <div
      v-for="(glow, i) in GLOWS"
      :key="i"
      :ref="(el) => (glowEls[i].x = el as HTMLElement | null)"
      class="console-glow-drift"
      :style="{ left: `${glow.x * size.w}px`, top: `${glow.y * size.h}px` }"
    >
      <div :ref="(el) => (glowEls[i].y = el as HTMLElement | null)" class="console-glow-drift">
        <div class="console-glow" :style="glowLook(glow)"></div>
      </div>
    </div>
    <canvas ref="canvasRef" class="console-orca"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAppStore } from '@/stores'
import { useTheme } from '@/composables/useTheme'
import { consoleFlow, frameDue, stepFlow } from './consoleFlow'
import { DESKTOP_MIN_WIDTH } from './consoleGlass'
import { FRAME_ORDER, addFrameTask } from './consoleFrame'
import { FieldPainter } from './fieldPainter'
import { DARK_GLOW_ALPHA, GLOWS, SINE_SWING, driftX, driftY, offsetAt, type Glow } from './fieldGlows'
import { createGovernor, fieldQuality, qualitySteps, setFieldQuality, type FieldQuality } from './fieldQuality'
import type { GlassScene } from './glassScene'
import type { GlassRect } from './glassOptics'

/**
 * The living field behind the floating glass sidebar, and the glass optics drawn into it.
 * Clear glass over still paper reads as a plain panel; motion behind it is what makes the
 * sidebar read as liquid glass. The sidebar's edge lensing and the capsule's magnification are
 * painted here (FieldPainter), so neither carries a live backdrop filter that the browser would
 * have to recompute every frame the field moves.
 *
 * Only what moves every frame is painted every frame: the cover's line-drawn orca, drawn on once
 * per tab and then swimming in place, on the shared console frame loop, capped at 60 fps
 * (FLOW.maxFps); a capsule move redraws at once. The glows are
 * elements below the canvas drifting on compositor animations (fieldGlows), and the fade toward the
 * workspace is the container's mask, so neither costs the main thread anything per frame. Pauses
 * with the hidden tab like any rAF loop; with prefers-reduced-motion it shows the finished drawing, still.
 * A device whose frames stay slow while the field moves steps down (fieldQuality): a lower-resolution
 * canvas, then a still field, so the console stays smooth on any machine.
 *
 * Desktop: the field lies beside the sidebar and fades out before the workspace. Phone: the
 * sidebar is a drawer, so the field spans the screen above the drawer's veil only while the
 * drawer is open, and stops once it has faded out.
 */
const props = defineProps<{
  /** The sidebar the field is seen through (AppLayout passes AppSidebar's aside). */
  sidebar: HTMLElement | null
  /** The layout's glass scene: the sidebar capsule's box, and the redraw it asks for. */
  scene: GlassScene
}>()

const FIELD_WIDTH = 640 // px of field from the left edge on desktop
const FADE_FROM = { desktop: 0.45, drawer: 0.7 } // fraction of the width where the fade-out starts
const DRAWER_FADE_MS = 300 // matches the container opacity transition below
const SIDEBAR_RADIUS = 24 // .sidebar border-radius

const media = (query: string) => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
const reducedMotion = media('(prefers-reduced-motion: reduce)')
const reducedTransparency = media('(prefers-reduced-transparency: reduce)') // the sidebar is solid then

const appStore = useAppStore()
const { isDark } = useTheme()
const drawerOpen = computed(() => appStore.mobileOpen)
const phone = ref(typeof window !== 'undefined' && window.innerWidth < DESKTOP_MIN_WIDTH)
const size = reactive({ w: 0, h: 0 })
const canvasRef = ref<HTMLCanvasElement | null>(null)
const glowEls = GLOWS.map(() => ({ x: null as HTMLElement | null, y: null as HTMLElement | null }))
const governor = createGovernor(fieldQuality.value, qualitySteps(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
/** The field stands still: reduced motion, or a device that could not keep it moving smoothly. */
const still = () => reducedMotion || fieldQuality.value === 'still'
const painter = new FieldPainter()
let ctx: CanvasRenderingContext2D | null = null
let lastTime = 0
let lastFrame = 0 // rAF time of the previous frame, for the governor
let lensMoved = false
let drawerFade = 0 // timer while the closed drawer's field fades out
let sidebarObserver: ResizeObserver | null = null
let glowAnimations: Animation[] = []

const glowLook = (glow: Glow) => ({
  width: `${glow.r * 2}px`,
  height: `${glow.r * 2}px`,
  background: `radial-gradient(closest-side, rgb(${glow.rgb} / ${isDark.value ? glow.a * DARK_GLOW_ALPHA : glow.a}), rgb(${glow.rgb} / 0))`,
})

/** Starts each glow's drift where the shared glow clock stands, so a page switch does not reset it. */
function startGlows() {
  glowAnimations.forEach((a) => a.cancel())
  glowAnimations = []
  GLOWS.forEach((glow, i) => {
    const { x, y } = glowEls[i]
    if (!x || !y) return
    if (still() || typeof x.animate !== 'function') {
      const at = offsetAt(glow, consoleFlow.glowTime)
      x.style.transform = `translateX(${at.x}px)`
      y.style.transform = `translateY(${at.y}px)`
      return
    }
    for (const [el, axis, d] of [
      [x, 'X', driftX(glow, consoleFlow.glowTime)],
      [y, 'Y', driftY(glow, consoleFlow.glowTime)],
    ] as const) {
      const animation = el.animate(
        [{ transform: `translate${axis}(${-d.amplitude}px)` }, { transform: `translate${axis}(${d.amplitude}px)` }],
        { duration: d.swingMs, iterations: Infinity, direction: 'alternate', easing: SINE_SWING }
      )
      animation.currentTime = d.currentTimeMs
      glowAnimations.push(animation)
    }
  })
}

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
  size.w = fieldWidth()
  size.h = window.innerHeight
  const dpr = fieldQuality.value === 'full' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  canvas.style.width = `${size.w}px`
  canvas.style.height = `${size.h}px`
  canvas.width = Math.round(size.w * dpr)
  canvas.height = Math.round(size.h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** The sidebar as the field sees it this frame, or null when it is off the field (closed drawer). */
function glassRect(): GlassRect | null {
  if (!props.sidebar || reducedTransparency) return null
  const r = props.sidebar.getBoundingClientRect()
  if (r.right <= 0 || r.left >= size.w) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: SIDEBAR_RADIUS }
}

function draw() {
  if (!ctx || !size.w || !size.h) return
  const glass = glassRect()
  painter.paint(ctx, {
    width: size.w,
    height: size.h,
    dark: isDark.value,
    time: consoleFlow.orcaTime,
    elapsed: still() ? Infinity : consoleFlow.orcaTime,
    glass,
    lens: glass ? props.scene.lens() : null,
  })
}

/** Steps down to a lighter field (see fieldQuality) and remembers it for the tab. */
function stepDown(next: FieldQuality) {
  setFieldQuality(next)
  if (still()) startGlows()
  refresh()
}

const task = addFrameTask(FRAME_ORDER.field, (now) => {
  if (!size.w) {
    lastTime = 0
    lastFrame = 0
    return false
  }
  const lensStep = lensMoved
  lensMoved = false
  if (still()) {
    draw()
    lastFrame = 0
    return false
  }
  if (lastFrame) {
    const next = governor.record(now - lastFrame)
    if (next) stepDown(next)
  }
  lastFrame = now
  if (lastTime && !frameDue(now, lastTime) && !lensStep) return true
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0
  lastTime = now
  stepFlow(consoleFlow, dt)
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

watch(isDark, draw)

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
  props.scene.onInvalidate(() => {
    lensMoved = true
    task.wake()
  })
  refresh()
  startGlows()
  window.addEventListener('resize', refresh)
})

onBeforeUnmount(() => {
  task.remove()
  props.scene.onInvalidate(() => {})
  glowAnimations.forEach((a) => a.cancel())
  window.clearTimeout(drawerFade)
  window.removeEventListener('resize', refresh)
  sidebarObserver?.disconnect()
  sidebarObserver = null
})
</script>

<style scoped>
/* The field: glows below, the orca above, faded toward the workspace by a mask (not per frame). */
.console-field {
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, #000 var(--field-fade), transparent);
  mask-image: linear-gradient(to right, #000 var(--field-fade), transparent);
}

.console-glow-drift {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.console-glow-drift .console-glow-drift {
  position: static;
}

.console-glow {
  translate: -50% -50%;
}

.console-orca {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}

/* Phone: above the drawer's veil (z 35) and below the drawer (z 40), fading with the veil. */
.console-field-drawer {
  z-index: 36;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.console-field-open {
  opacity: 1;
}
</style>
