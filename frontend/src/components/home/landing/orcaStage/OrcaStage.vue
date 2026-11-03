<template>
  <canvas ref="canvasRef" class="orca-stage" role="img" :aria-label="label"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createGovernor, fieldQuality, qualitySteps, setFieldQuality } from '@/components/layout/fieldQuality'
import { CoverScene, type Palette, type StageMetrics } from './coverScene'

const props = defineProps<{
  label: string
  wordmark: string
}>()

const PIXEL_BUDGET = 3_200_000
const MAX_DT = 0.05
const WORDMARK_FONT = '"Manrope Variable", "Manrope", system-ui, sans-serif'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let scene: CoverScene | null = null
let frame = 0
let lastTime = 0
let clock = 0 // s since the stage started: the wave and the orca are drawn on from 0
let reducedMotion = false
/** The same device steps as the console field (fieldQuality): a lighter canvas, then a still cover. */
let governor: ReturnType<typeof createGovernor> | null = null
const still = () => reducedMotion || fieldQuality.value === 'still'

/** Wordmark: clamp(64px, 14.5vw, 232px), centred at 47% of the height (40% on phones). */
function stageMetrics(width: number, height: number, dpr: number): StageMetrics {
  const narrow = width < 760
  return {
    width,
    height,
    dpr,
    fontSize: Math.min(232, Math.max(64, width * 0.145)),
    gateY: height * (narrow ? 0.4 : 0.47),
    artTop: narrow ? 132 : 148,
  }
}

function readPalette(el: HTMLElement): Palette {
  const style = getComputedStyle(el)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    ink: read('--landing-ink-rgb', '31 29 26'),
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
  scene.render(clock)
}

function tick(time: number) {
  const step = lastTime ? governor?.record(time - lastTime) : null
  if (step) {
    setFieldQuality(step)
    if (still()) scene?.settle()
    layout()
    if (still()) return // the cover stays on the frame it shows
  }
  clock += lastTime ? Math.min(MAX_DT, (time - lastTime) / 1000) : 1 / 60
  lastTime = time
  scene?.render(clock)
  frame = requestAnimationFrame(tick)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  scene = CoverScene.create(canvas, readPalette(canvas), props.wordmark, WORDMARK_FONT)
  if (!scene) return

  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (still()) scene.settle()
  layout()
  window.addEventListener('resize', layout)
  // The wordmark is measured with the web font; lay out again once it is available.
  document.fonts?.load(`800 100px ${WORDMARK_FONT}`).then(layout, () => undefined)

  if (still()) return
  governor = createGovernor(fieldQuality.value, qualitySteps(window.devicePixelRatio || 1))
  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', layout)
  scene = null
})
</script>

<style scoped>
.orca-stage {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
