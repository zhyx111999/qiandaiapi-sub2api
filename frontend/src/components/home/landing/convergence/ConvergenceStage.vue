<template>
  <canvas ref="canvasRef" class="convergence-stage" role="img" :aria-label="label"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createGovernor, fieldQuality, qualitySteps, setFieldQuality } from '@/components/layout/fieldQuality'
import { StrandDisturbance } from './disturbance'
import { PulseTrain } from './pulses'
import { ConvergenceScene, PULSE_TAIL, type Palette, type StageMetrics } from './scene'

const props = defineProps<{
  label: string
  wordmark: string
}>()

const PIXEL_BUDGET = 3_200_000
const MAX_DT = 0.05
const AMBIENT_INTERVAL: readonly [number, number] = [1.3, 2.6] // s between automatic calls
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], [role="menu"]'
const WORDMARK_FONT = '"Manrope Variable", "Manrope", system-ui, sans-serif'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const disturbance = new StrandDisturbance()
const pulses = new PulseTrain()
let scene: ConvergenceScene | null = null
let frame = 0
let lastTime = 0
let clock = 0
let nextAmbient = 0.4
let reducedMotion = false
/** The same device steps as the console field (fieldQuality): a lighter canvas, then a still cover. */
let governor: ReturnType<typeof createGovernor> | null = null
const still = () => reducedMotion || fieldQuality.value === 'still'

/**
 * Wordmark: clamp(64px, 14.5vw, 232px), centred at 47% of the height (40% on phones).
 * Fan: clear of the header and the brand on desktop; a tighter band between the nav and the copy on phones.
 */
function stageMetrics(width: number, height: number, dpr: number): StageMetrics {
  const narrow = width < 760
  return {
    width,
    height,
    dpr,
    fontSize: Math.min(232, Math.max(64, width * 0.145)),
    gateY: height * (narrow ? 0.4 : 0.47),
    fanTop: height * (narrow ? 0.17 : 0.12),
    fanBottom: height * (narrow ? 0.64 : 0.94),
    artTop: narrow ? 132 : 148,
  }
}

function readPalette(el: HTMLElement): Palette {
  const style = getComputedStyle(el)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    ink: read('--landing-ink-rgb', '31 29 26'),
    accent: read('--landing-accent-rgb', '59 146 113'),
    frost: read('--landing-frost-rgb', '253 251 247'),
  }
}

function layout() {
  const canvas = canvasRef.value
  if (!canvas || !scene) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  const density = fieldQuality.value === 'full' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const dpr = Math.min(density, Math.sqrt(PIXEL_BUDGET / (width * height)))
  scene.resize(stageMetrics(width, height, dpr))
  scene.update(clock, 0, disturbance)
  scene.render(clock, pulses)
}

function speed() {
  return (scene?.current?.width ?? 1200) / 4.2
}

/** Background traffic: a call enters from the left edge on a random strand. */
function spawnAmbient() {
  if (!scene) return
  const strand = Math.floor(Math.random() * scene.strands.length)
  pulses.spawn(strand, -PULSE_TAIL * 0.2, speed() * (0.85 + Math.random() * 0.3))
}

function tick(time: number) {
  const step = lastTime ? governor?.record(time - lastTime) : null
  if (step) {
    setFieldQuality(step)
    if (still()) scene?.settle()
    layout()
    if (still()) return // the cover stays on the frame it shows
  }
  const dt = lastTime ? Math.min(MAX_DT, (time - lastTime) / 1000) : 1 / 60
  lastTime = time
  clock += dt

  nextAmbient -= dt
  if (nextAmbient <= 0) {
    spawnAmbient()
    const [min, max] = AMBIENT_INTERVAL
    nextAmbient = min + Math.random() * (max - min)
  }

  disturbance.step(dt)
  pulses.step(dt, scene?.current?.width ?? 0, PULSE_TAIL)
  scene?.update(clock, dt, disturbance)
  scene?.render(clock, pulses)
  frame = requestAnimationFrame(tick)
}

function onPointerMove(event: PointerEvent) {
  disturbance.setPointer(event.clientX, event.clientY)
}

function onPointerLeave() {
  disturbance.leave()
}

/** A click sends a call: the nearest strand and two neighbours carry a pulse, and the strands get plucked. */
function onPointerDown(event: PointerEvent) {
  if (!scene || event.button !== 0) return
  if ((event.target as Element | null)?.closest?.(INTERACTIVE)) return
  const { clientX: x, clientY: y } = event
  const nearest = scene.nearestStrand(x, y)
  for (const offset of [0, -2, 2]) {
    const strand = nearest + offset
    if (strand < 0 || strand >= scene.strands.length) continue
    pulses.spawn(strand, x - Math.abs(offset) * 14, speed() * (offset === 0 ? 1.15 : 1))
  }
  disturbance.pluck(x, y)
  scene.ripple(x, y)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const count = window.innerWidth < 760 ? 28 : 44
  scene = ConvergenceScene.create(canvas, readPalette(canvas), props.wordmark, WORDMARK_FONT, count)
  if (!scene) return

  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (still()) scene.settle()
  layout()
  window.addEventListener('resize', layout)
  // The wordmark is measured with the web font; lay out again once it is available.
  document.fonts?.load(`800 100px ${WORDMARK_FONT}`).then(layout, () => undefined)

  if (still()) return
  governor = createGovernor(fieldQuality.value, qualitySteps(window.devicePixelRatio || 1))
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pointerdown', onPointerDown)
  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', layout)
  window.removeEventListener('pointermove', onPointerMove)
  document.documentElement.removeEventListener('pointerleave', onPointerLeave)
  window.removeEventListener('pointerdown', onPointerDown)
  scene = null
})
</script>

<style scoped>
.convergence-stage {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
