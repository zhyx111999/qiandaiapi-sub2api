<template>
  <div class="deep-space" aria-hidden="true">
    <div class="deep-space__nebula deep-space__nebula--a"></div>
    <div class="deep-space__nebula deep-space__nebula--b"></div>
    <canvas ref="canvasRef" class="deep-space__stars"></canvas>
    <div class="deep-space__twinkle"></div>
    <div class="deep-space__vignette"></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Static star field: redrawn only on resize, the nebula and twinkle layers carry the motion. */
const canvasRef = ref<HTMLCanvasElement | null>(null)
const STAR_DENSITY = 1 / 1600 // stars per CSS pixel²

function drawStars() {
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

  const count = Math.round(width * height * STAR_DENSITY)
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    // Mostly faint pin-pricks; only the rare bright star gets a halo.
    const bright = Math.pow(Math.random(), 4)
    const radius = 0.2 + bright * 1.0
    const tint = Math.random()
    ctx.fillStyle = tint < 0.12 ? '#9fe9f3' : tint < 0.2 ? '#9cc2ff' : '#eaf4ff'
    ctx.globalAlpha = 0.12 + bright * 0.8
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    if (bright > 0.7) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 6)
      glow.addColorStop(0, 'rgb(170 225 255 / 0.35)')
      glow.addColorStop(1, 'rgb(170 225 255 / 0)')
      ctx.fillStyle = glow
      ctx.fillRect(x - radius * 6, y - radius * 6, radius * 12, radius * 12)
    }
  }
  ctx.globalAlpha = 1
}

onMounted(() => {
  drawStars()
  window.addEventListener('resize', drawStars)
})

onBeforeUnmount(() => window.removeEventListener('resize', drawStars))
</script>

<style scoped>
.deep-space {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(85% 65% at 50% 46%, rgb(10 30 52 / 0.55), transparent 70%),
    linear-gradient(180deg, #03060b 0%, #010204 100%);
}

.deep-space__nebula {
  position: absolute;
  inset: -20%;
  animation: deep-space-drift 90s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
}

.deep-space__nebula--a {
  background:
    radial-gradient(36% 28% at 70% 30%, rgb(38 160 209 / 0.14), transparent 70%),
    radial-gradient(32% 26% at 24% 70%, rgb(36 82 168 / 0.16), transparent 72%);
}

.deep-space__nebula--b {
  background: radial-gradient(28% 22% at 50% 52%, rgb(112 224 237 / 0.06), transparent 70%);
  animation-duration: 120s;
  animation-direction: alternate-reverse;
}

.deep-space__stars {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.deep-space__twinkle {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1.2px 1.2px at 12% 18%, rgb(255 255 255 / 0.9), transparent),
    radial-gradient(1px 1px at 72% 12%, rgb(200 245 252 / 0.8), transparent),
    radial-gradient(1.5px 1.5px at 42% 62%, rgb(112 224 237 / 0.85), transparent),
    radial-gradient(1px 1px at 86% 70%, rgb(255 255 255 / 0.7), transparent),
    radial-gradient(1.3px 1.3px at 24% 86%, rgb(150 190 255 / 0.8), transparent),
    radial-gradient(1px 1px at 58% 34%, rgb(255 255 255 / 0.6), transparent);
  background-size: 460px 460px;
  animation: deep-space-twinkle 6s ease-in-out infinite alternate;
}

.deep-space__vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 90% at 50% 42%, transparent 52%, rgb(0 0 0 / 0.7) 100%);
}

@keyframes deep-space-drift {
  from {
    transform: translate3d(-2%, -1.5%, 0) scale(1);
  }
  to {
    transform: translate3d(2.5%, 2%, 0) scale(1.06);
  }
}

@keyframes deep-space-twinkle {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .deep-space__nebula,
  .deep-space__twinkle {
    animation: none;
  }
}
</style>
