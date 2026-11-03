<template>
  <section class="landing-hero">
    <div class="landing-hero__inner">
      <p class="landing-kicker" aria-hidden="true"><i></i>{{ BRAND.kicker }}<i></i></p>

      <!-- The wordmark is drawn as frosted glass by the orca stage, centred in the gap below. -->

      <div class="landing-hero__bottom">
        <div class="landing-hero__copy">
          <h1 class="landing-headline">
            {{ t('landingHome.headline.lead') }}<span class="is-hl">{{ t('landingHome.headline.highlight') }}</span>
          </h1>
          <p class="landing-lead">{{ t('landingHome.description') }}</p>
        </div>

        <div class="landing-hero__actions">
          <router-link
            v-liquid-glass="{ scale: 30, aberration: 3 }"
            :to="consolePath"
            class="landing-btn landing-btn--primary liquid-glass"
          >
            <span>{{ t('home.goToDashboard') }}</span>
            <i aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </i>
          </router-link>
        </div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import { BRAND } from './brand'

defineProps<{
  consolePath: string
}>()

const { t } = useI18n()
</script>

<style scoped>
.landing-hero {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  min-height: 100svh;
}

.landing-hero__inner {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: min(1240px, calc(100% - clamp(36px, 7vw, 120px)));
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: 118px 0 clamp(42px, 7vh, 72px);
}

.landing-kicker {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 16px;
  margin: clamp(6px, 4vh, 40px) 0 0;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.42em;
  color: var(--landing-ink-3);
  animation: landing-fade 1.2s var(--landing-ease) 0.5s backwards;
}

.landing-kicker i {
  width: 46px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--landing-accent));
}

.landing-kicker i:last-child {
  transform: scaleX(-1);
}

.landing-hero__bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.landing-hero__copy {
  position: relative;
  max-width: 620px;
  animation: landing-rise 1.2s var(--landing-ease) 0.7s backwards;
}

/* Paper-coloured halo so the copy stays legible where strands pass beneath it. */
.landing-hero__copy::before {
  content: '';
  position: absolute;
  inset: -70px -120px -60px -90px;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    closest-side,
    rgb(var(--landing-paper-rgb) / 0.92),
    rgb(var(--landing-paper-rgb) / 0.6) 55%,
    transparent
  );
}

.landing-headline {
  margin: 0;
  font-family: var(--landing-serif);
  font-size: clamp(34px, 3.8vw, 60px);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: 0.02em;
  color: var(--landing-ink);
}

.landing-headline .is-hl {
  color: var(--landing-accent);
}

.landing-lead {
  max-width: 32em;
  margin: 18px 0 0;
  font-size: 15.5px;
  line-height: 1.8;
  color: var(--landing-ink-2);
  text-wrap: pretty;
}

.landing-hero__actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  animation: landing-rise 1.2s var(--landing-ease) 0.85s backwards;
}

.landing-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 56px;
  padding: 0 28px;
  border-radius: 999px;
  font: 700 15px / 1 var(--landing-font);
  white-space: nowrap;
  color: var(--landing-ink);
  transition:
    transform 0.5s var(--landing-ease),
    box-shadow 0.35s;
}

.landing-btn:hover {
  transform: translateY(-2px);
}

.landing-btn:active {
  transform: scale(0.97);
}

/* Primary: smoked ink glass, the one ink surface on the page (light on the dark cover), with a green orb. */
.landing-btn--primary {
  --glass-tint: var(--landing-ink-rgb);
  --glass-tint-alpha: 0.86;
  --glass-blur: 10px;
  --glass-blur-refract: 4px;
  --glass-brightness: 0.96;
  --glass-rim: rgb(255 255 255 / 0.16);
  --glass-sheen: rgb(255 255 255 / 0.16);
  --glass-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.22),
    inset 0 0 18px -8px rgb(255 255 255 / 0.4),
    0 2px 4px rgb(var(--landing-shade-rgb) / 0.12),
    0 20px 40px -18px rgb(var(--landing-shade-rgb) / 0.55);
  padding: 0 9px 0 30px;
  color: rgb(var(--landing-paper-rgb));
}

.landing-btn--primary:hover {
  --glass-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.26),
    inset 0 0 20px -6px rgb(255 255 255 / 0.45),
    0 2px 4px rgb(var(--landing-shade-rgb) / 0.12),
    0 26px 50px -18px rgb(var(--landing-shade-rgb) / 0.6);
}

.landing-btn--primary i {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--landing-accent);
  color: #fff;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3);
  transition: transform 0.5s var(--landing-ease);
}

.landing-btn--primary i svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.landing-btn--primary:hover i {
  transform: translateX(2px) rotate(-45deg);
}

@keyframes landing-fade {
  from {
    opacity: 0;
  }
}

@keyframes landing-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 24px, 0);
  }
}

@keyframes landing-pulse {
  50% {
    opacity: 0.3;
  }
}

@media (max-width: 980px) {
  .landing-hero__bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 26px;
  }
}

@media (max-width: 760px) {
  /* One header row (brand, language, login); the site nav is at the bottom. */
  .landing-hero__inner {
    padding-top: 110px;
  }

  .landing-kicker {
    gap: 10px;
    font-size: 10px;
    letter-spacing: 0.3em;
  }

  .landing-kicker i {
    width: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-kicker,
  .landing-hero__copy,
  .landing-hero__actions {
    animation: none;
  }
}
</style>
