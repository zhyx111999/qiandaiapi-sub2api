<template>
  <canvas ref="canvasRef" class="console-strands" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createStrands, strandY, type StrandLayout } from '@/components/home/landing/convergence/strands'

/**
 * A quiet, static field of the landing page's strands behind the floating glass
 * sidebar. Glass over flat paper reads as a plain panel; these lines give the
 * frost something to soften and the edge lens something to bend. Drawn only on
 * resize or theme change, and faded out before the workspace content.
 */
const FIELD_WIDTH = 640 // px of strands from the left edge
const MIN_VIEWPORT = 1024 // the sidebar floats over the page only on desktop (lg)
const STEP = 6
const ACCENT_EVERY = 9
const COLORS = {
  light: { ink: '31 29 26', accent: '59 146 113' },
  dark: { ink: '235 236 229', accent: '101 184 150' },
} as const

/** Deterministic layout so the background does not change between pages. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const strands = createStrands(30, seeded(20261027))
let themeObserver: MutationObserver | null = null

function draw() {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (width < MIN_VIEWPORT || !height) return

  const reach = Math.min(FIELD_WIDTH, width * 0.5)
  const layout: StrandLayout = {
    width: reach,
    height,
    fanTop: -height * 0.04,
    fanBottom: height * 1.04,
    gateY: height * 0.56,
    entryX: reach * 0.7,
    exitX: reach * 0.7,
    waist: height * 0.14,
  }
  const { ink, accent } = document.documentElement.classList.contains('dark') ? COLORS.dark : COLORS.light

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  strands.forEach((strand, index) => {
    const isAccent = index % ACCENT_EVERY === ACCENT_EVERY >> 1
    const alpha = isAccent ? 0.5 : 0.14 + strand.weight * 0.3
    ctx.strokeStyle = `rgb(${isAccent ? accent : ink} / ${alpha})`
    ctx.lineWidth = 0.7 + strand.weight * 0.9
    ctx.beginPath()
    for (let x = 0; x <= reach; x += STEP) {
      const y = strandY(strand, x, layout, 0)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  })

  // Fade into the workspace so cards and tables stay on clean paper.
  const fadeStart = reach * 0.45
  const fade = ctx.createLinearGradient(fadeStart, 0, reach, 0)
  fade.addColorStop(0, 'rgb(0 0 0 / 0)')
  fade.addColorStop(1, 'rgb(0 0 0 / 1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = fade
  ctx.fillRect(fadeStart, 0, width - fadeStart, height)
  ctx.globalCompositeOperation = 'source-over'
}

onMounted(() => {
  draw()
  window.addEventListener('resize', draw)
  themeObserver = new MutationObserver(draw)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', draw)
  themeObserver?.disconnect()
  themeObserver = null
})
</script>

<style scoped>
.console-strands {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
