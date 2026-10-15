<template>
  <div class="paper" aria-hidden="true">
    <div class="paper__daylight"></div>
    <div class="paper__grain"></div>
  </div>
</template>

<style scoped>
/* Ivory paper: soft daylight from the top left, a breath of the accent bottom right, warm edges and fine grain. */
.paper {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(60% 55% at 86% 80%, rgb(var(--landing-accent-rgb) / 0.07), transparent 72%),
    radial-gradient(130% 95% at 50% 42%, transparent 58%, rgb(var(--landing-ink-rgb) / 0.07) 100%),
    rgb(var(--landing-paper-rgb));
}

.paper__daylight {
  position: absolute;
  inset: -25%;
  background: radial-gradient(38% 34% at 26% 18%, rgb(255 255 255 / 0.9), transparent 72%);
  animation: paper-daylight 70s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
}

.paper__grain {
  position: absolute;
  inset: 0;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.42 0 0 0 0 0.36 0 0 0 0 0.28 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 240px 240px;
}

@keyframes paper-daylight {
  from {
    transform: translate3d(-3%, -2%, 0);
  }
  to {
    transform: translate3d(4%, 3%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .paper__daylight {
    animation: none;
  }
}
</style>
