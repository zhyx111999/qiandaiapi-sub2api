<template>
  <canvas ref="canvasRef" class="three-body-stage" role="img" :aria-label="label"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { OrbitCamera } from './camera'
import { BODY_COUNT, integrateFigureEight, sampleOrbit } from './orbit'
import { OrbitPerturbation } from './perturbation'
import { ThreeBodyScene, TRAIL_INTERVAL, TRAIL_LENGTH } from './scene'

defineProps<{ label: string }>()

/** Seconds the bodies take to run the full figure-eight once. */
const ORBIT_SECONDS = 9.5
/** Seconds for one full self-rotation of the orbital plane. */
const SPIN_SECONDS = 64
const BASE_TILT = 1.08
const PIXEL_BUDGET = 3_200_000
const MAX_DT = 0.05
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], [role="menu"]'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const table = integrateFigureEight()
const camera = new OrbitCamera()
const perturbation = new OrbitPerturbation()
const base = new Float64Array(BODY_COUNT * 2)
const bodies = new Float64Array(BODY_COUNT * 2)

let scene: ThreeBodyScene | null = null
let frame = 0
let lastTime = 0
let clock = 0
let phase = 0.08
let pointerX = 0.5
let pointerY = 0.5
let reducedMotion = false

function layout() {
  const canvas = canvasRef.value
  if (!canvas || !scene) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)))
  scene.resize(width, height, dpr)
  camera.centerX = width / 2
  camera.centerY = height * 0.46
  camera.unit = Math.min(width * (width < 760 ? 0.4 : 0.3), height * 0.6)
  if (reducedMotion) draw()
}

function currentBodies() {
  return perturbation.apply(sampleOrbit(table, phase, base), bodies)
}

function draw() {
  camera.update()
  scene?.render(camera, bodies, perturbation.energy)
}

/** Fills the comet trails with the recent past so the first frame already looks complete. */
function seedTrails() {
  const step = TRAIL_INTERVAL / ORBIT_SECONDS
  for (let k = TRAIL_LENGTH; k >= 0; k--) {
    scene?.pushTrail(sampleOrbit(table, phase - k * step, base))
  }
  currentBodies()
}

function tick(time: number) {
  const dt = lastTime ? Math.min(MAX_DT, (time - lastTime) / 1000) : 1 / 60
  lastTime = time
  clock += dt

  const energy = perturbation.energy
  phase += (dt / ORBIT_SECONDS) * (1 + 0.4 * energy)
  camera.spin += ((dt * Math.PI * 2) / SPIN_SECONDS) * (1 + 2.2 * energy)

  // Pointer parallax eased toward its target, plus a slow breathing tilt.
  const ease = 1 - Math.exp(-dt * 3)
  camera.yaw += ((pointerX - 0.5) * 0.22 - camera.yaw) * ease
  const targetTilt = BASE_TILT + Math.sin(clock * 0.11) * 0.05 + (pointerY - 0.5) * 0.1
  camera.tilt += (targetTilt - camera.tilt) * ease

  perturbation.step(dt)
  currentBodies()
  scene?.advanceTrails(bodies, dt)
  scene?.emit(bodies, dt, perturbation.energy)
  scene?.update(dt)
  draw()
  frame = requestAnimationFrame(tick)
}

function onPointerMove(event: PointerEvent) {
  pointerX = event.clientX / Math.max(1, window.innerWidth)
  pointerY = event.clientY / Math.max(1, window.innerHeight)
}

function onPointerDown(event: PointerEvent) {
  if (reducedMotion || event.button !== 0) return
  if ((event.target as Element | null)?.closest?.(INTERACTIVE)) return
  camera.update()
  const plane = camera.unproject(event.clientX, event.clientY)
  perturbation.kick(bodies, plane.x, plane.y)
  scene?.impulse(event.clientX, event.clientY, plane.x, plane.y)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  scene = ThreeBodyScene.create(canvas, table)
  if (!scene) return

  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  camera.tilt = BASE_TILT
  layout()
  seedTrails()
  window.addEventListener('resize', layout)

  if (reducedMotion) {
    draw()
    return
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown)
  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', layout)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', onPointerDown)
  scene = null
})
</script>

<style scoped>
.three-body-stage {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
