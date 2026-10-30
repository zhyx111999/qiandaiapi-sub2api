<template>
  <canvas ref="canvasRef" class="console-strands" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createStrands, strandY, type StrandLayout } from '@/components/home/landing/convergence/strands'
import { FLOW, consoleFlow, frameDue, stepFlow } from './consoleFlow'
import { DESKTOP_MIN_WIDTH } from './consoleGlass'

/**
 * The living field behind the floating glass sidebar: the landing page's strands waving
 * slowly, pulses travelling along them and three drifting glows. Clear glass over still paper
 * reads as a plain panel; motion behind it is what makes the sidebar read as liquid glass.
 * Runs on requestAnimationFrame capped at 60 fps (FLOW.maxFps), pauses with the hidden tab
 * like any rAF loop, and with prefers-reduced-motion draws one still frame. The field fades out before the workspace
 * so cards and tables stay on clean paper.
 */
const FIELD_WIDTH = 640 // px of field from the left edge
const STEP = 6
const ACCENT_EVERY = 9
const DENSITY = 1.6
const COLORS = {
  light: { ink: '31 29 26', accent: '59 146 113' },
  dark: { ink: '235 236 229', accent: '101 184 150' },
} as const
const GLOWS = [
  { x: 0.2, y: 0.26, r: 260, rgb: '59 146 113', a: 0.22, sx: 0.13, sy: 0.11, ax: 40, ay: 70, phase: 0 },
  { x: 0.34, y: 0.72, r: 300, rgb: '214 170 96', a: 0.14, sx: 0.09, sy: 0.15, ax: 50, ay: 60, phase: 2.1 },
  { x: 0.06, y: 0.96, r: 230, rgb: '101 179 148', a: 0.18, sx: 0.17, sy: 0.07, ax: 30, ay: 40, phase: 4.2 },
] as const

/** Deterministic layout so the field does not change between pages. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const strands = createStrands(30, seeded(20261027))
const reducedMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
let ctx: CanvasRenderingContext2D | null = null
let reach = 0
let height = 0
let raf = 0
let lastTime = 0
let themeObserver: MutationObserver | null = null

function resize() {
  const canvas = canvasRef.value
  ctx = canvas?.getContext('2d') ?? null
  if (!canvas || !ctx) return
  reach = window.innerWidth < DESKTOP_MIN_WIDTH ? 0 : Math.min(FIELD_WIDTH, window.innerWidth * 0.5)
  height = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.style.width = `${reach}px`
  canvas.style.height = `${height}px`
  canvas.width = Math.round(reach * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function draw() {
  const c = ctx
  if (!c || !reach || !height) return
  const w = reach
  const h = height
  const dark = document.documentElement.classList.contains('dark')
  const { ink, accent } = dark ? COLORS.dark : COLORS.light
  c.clearRect(0, 0, w, h)

  for (const glow of GLOWS) {
    const x = glow.x * w + Math.sin(consoleFlow.glowTime * glow.sx + glow.phase) * glow.ax
    const y = glow.y * h + Math.cos(consoleFlow.glowTime * glow.sy + glow.phase) * glow.ay
    const gradient = c.createRadialGradient(x, y, 0, x, y, glow.r)
    gradient.addColorStop(0, `rgb(${glow.rgb} / ${dark ? glow.a * 0.75 : glow.a})`)
    gradient.addColorStop(1, `rgb(${glow.rgb} / 0)`)
    c.fillStyle = gradient
    c.fillRect(x - glow.r, y - glow.r, glow.r * 2, glow.r * 2)
  }

  const layout: StrandLayout = {
    width: w,
    height: h,
    fanTop: -h * 0.04,
    fanBottom: h * 1.04,
    gateY: h * 0.56,
    entryX: w * 0.7,
    exitX: w * 0.7,
    waist: h * 0.14,
  }
  const xs: number[] = []
  for (let x = 0; x <= w; x += STEP) xs.push(x)
  const paths = strands.map((strand) => xs.map((x) => strandY(strand, x, layout, consoleFlow.waveTime)))
  const widen = 1 + (DENSITY - 1) * 0.25

  c.lineCap = 'round'
  c.lineJoin = 'round'
  paths.forEach((ys, index) => {
    const strand = strands[index]
    const isAccent = index % ACCENT_EVERY === ACCENT_EVERY >> 1
    const alpha = Math.min(1, (isAccent ? 0.5 : 0.14 + strand.weight * 0.3) * DENSITY)
    c.strokeStyle = `rgb(${isAccent ? accent : ink} / ${alpha})`
    c.lineWidth = (0.7 + strand.weight * 0.9) * widen
    c.beginPath()
    c.moveTo(xs[0], ys[0])
    for (let k = 1; k < xs.length; k++) c.lineTo(xs[k], ys[k])
    c.stroke()
  })

  drawPulses(c, xs, paths, accent)

  // Fade into the workspace so cards and tables stay on clean paper.
  const fadeStart = w * 0.45
  const fade = c.createLinearGradient(fadeStart, 0, w, 0)
  fade.addColorStop(0, 'rgb(0 0 0 / 0)')
  fade.addColorStop(1, 'rgb(0 0 0 / 1)')
  c.globalCompositeOperation = 'destination-out'
  c.fillStyle = fade
  c.fillRect(fadeStart, 0, w - fadeStart, h)
  c.globalCompositeOperation = 'source-over'
}

/** Same look as the landing page calls: a fading trail, a soft glow and a bright head. */
function drawPulses(c: CanvasRenderingContext2D, xs: number[], paths: number[][], accent: string) {
  const last = xs.length - 1
  const column = (x: number) => Math.max(0, Math.min(last, Math.round(x / STEP)))
  for (const pulse of consoleFlow.pulses.pulses) {
    const ys = paths[pulse.strand]
    if (!ys) continue
    const head = column(pulse.x)
    const tail = column(pulse.x - FLOW.pulseTail)
    if (head <= tail) continue
    const trail = c.createLinearGradient(xs[tail], ys[tail], xs[head], ys[head])
    trail.addColorStop(0, `rgb(${accent} / 0)`)
    trail.addColorStop(1, `rgb(${accent} / 0.95)`)
    c.strokeStyle = trail
    c.lineWidth = 1.8
    c.beginPath()
    c.moveTo(xs[tail], ys[tail])
    for (let i = tail + 1; i <= head; i++) c.lineTo(xs[i], ys[i])
    c.stroke()
    if (pulse.x > xs[last]) continue // the head has left the field; only the tail remains
    const x = xs[head]
    const y = ys[head]
    const glow = c.createRadialGradient(x, y, 0, x, y, 14)
    glow.addColorStop(0, `rgb(${accent} / 0.42)`)
    glow.addColorStop(1, `rgb(${accent} / 0)`)
    c.fillStyle = glow
    c.fillRect(x - 14, y - 14, 28, 28)
    c.fillStyle = `rgb(${accent})`
    c.beginPath()
    c.arc(x, y, 2.4, 0, Math.PI * 2)
    c.fill()
  }
}

function frame(now: number) {
  raf = reach ? requestAnimationFrame(frame) : 0
  if (lastTime && !frameDue(now, lastTime)) return
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0
  lastTime = now
  stepFlow(consoleFlow, dt, reach, strands.length)
  draw()
}

function start() {
  if (reducedMotion) {
    draw()
    return
  }
  if (!raf && reach) {
    lastTime = 0
    raf = requestAnimationFrame(frame)
  }
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function onResize() {
  resize()
  draw()
  start()
}

onMounted(() => {
  resize()
  draw()
  start()
  window.addEventListener('resize', onResize)
  themeObserver = new MutationObserver(draw)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('resize', onResize)
  themeObserver?.disconnect()
  themeObserver = null
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
</style>
