<template>
  <section class="cosmos-hero">
    <div class="cosmos-hud" aria-hidden="true">
      <i class="is-tl"></i>
      <i class="is-tr"></i>
      <i class="is-bl"></i>
      <i class="is-br"></i>
      <span class="cosmos-hud__label is-left">{{ t('cosmosHome.hudLeft') }}</span>
      <span class="cosmos-hud__label is-right">{{ t('cosmosHome.hudRight') }}</span>
    </div>

    <div class="cosmos-hero__inner">
      <p class="cosmos-kicker" aria-hidden="true"><i></i>{{ BRAND.kicker }}<i></i></p>

      <div class="cosmos-wordmark" aria-hidden="true">
        <span :data-text="BRAND.wordmark">{{ BRAND.wordmark }}</span>
      </div>

      <div class="cosmos-hero__bottom">
        <div class="cosmos-hero__copy">
          <h1 class="cosmos-headline">
            {{ t('cosmosHome.headline.lead') }}<span class="is-hl">{{ t('cosmosHome.headline.highlight') }}</span>
          </h1>
          <p class="cosmos-lead">{{ t('cosmosHome.description') }}</p>
        </div>

        <div class="cosmos-hero__actions">
          <router-link
            v-liquid-glass="{ scale: 30, aberration: 4 }"
            :to="consolePath"
            class="cosmos-btn cosmos-btn--primary liquid-glass"
          >
            <span>{{ t('home.goToDashboard') }}</span>
            <i aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </i>
          </router-link>
          <router-link
            v-liquid-glass="{ scale: 24 }"
            :to="explorePath"
            class="cosmos-btn cosmos-btn--ghost liquid-glass"
          >
            {{ t('cosmosHome.explore') }}
          </router-link>
        </div>
      </div>
    </div>

    <p class="cosmos-hint" aria-hidden="true"><i></i>{{ t('cosmosHome.hint') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import { BRAND } from './brand'

defineProps<{
  consolePath: string
  explorePath: string
}>()

const { t } = useI18n()
</script>

<style scoped>
.cosmos-hero {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  min-height: 100svh;
}

.cosmos-hero__inner {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: min(1240px, calc(100% - clamp(36px, 7vw, 120px)));
  min-height: 100vh;
  min-height: 100svh;
  margin: 0 auto;
  padding: 118px 0 clamp(42px, 7vh, 72px);
}

/* HUD: corner brackets and coordinate labels. */
.cosmos-hud {
  position: absolute;
  inset: 96px clamp(16px, 2.6vw, 40px) 26px;
  pointer-events: none;
}

.cosmos-hud i {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 0 solid rgb(112 224 237 / 0.4);
}

.cosmos-hud .is-tl {
  left: 0;
  top: 0;
  border-width: 1px 0 0 1px;
}

.cosmos-hud .is-tr {
  right: 0;
  top: 0;
  border-width: 1px 1px 0 0;
}

.cosmos-hud .is-bl {
  left: 0;
  bottom: 0;
  border-width: 0 0 1px 1px;
}

.cosmos-hud .is-br {
  right: 0;
  bottom: 0;
  border-width: 0 1px 1px 0;
}

.cosmos-hud__label {
  position: absolute;
  top: 4px;
  font: 700 10px var(--cosmos-mono);
  letter-spacing: 0.22em;
  color: var(--cosmos-ink-3);
}

.cosmos-hud__label.is-left {
  left: 34px;
}

.cosmos-hud__label.is-right {
  right: 34px;
}

.cosmos-kicker {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 16px;
  margin-top: clamp(6px, 4vh, 40px);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.42em;
  color: var(--cosmos-ink-2);
  animation: cosmos-fade 1.2s var(--cosmos-ease) 0.5s backwards;
}

.cosmos-kicker i {
  width: 46px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cosmos-accent));
}

.cosmos-kicker i:last-child {
  transform: scaleX(-1);
}

/* Wordmark: translucent glass letters, lit rim, and a slow light sweep. */
.cosmos-wordmark {
  position: absolute;
  left: 0;
  right: 0;
  top: 47%;
  transform: translateY(-50%);
  text-align: center;
  pointer-events: none;
}

/* Bottom padding keeps descenders inside the painted background box. */
.cosmos-wordmark span {
  position: relative;
  display: inline-block;
  padding: 0.04em 0.04em 0.2em;
  font: 800 clamp(64px, 14.5vw, 232px) / 1 var(--cosmos-font);
  letter-spacing: -0.045em;
  color: transparent;
  background: linear-gradient(
    180deg,
    rgb(244 251 255 / 0.5) 0%,
    rgb(170 230 242 / 0.12) 40%,
    rgb(112 224 237 / 0.05) 60%,
    rgb(112 224 237 / 0.3) 80%,
    rgb(112 224 237 / 0.1) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-stroke: 1.2px rgb(205 245 252 / 0.62);
  filter: drop-shadow(0 0 28px rgb(112 224 237 / 0.18));
  animation: cosmos-wordmark-in 1.8s var(--cosmos-ease) 0.25s both;
}

.cosmos-wordmark span::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  padding: inherit;
  color: transparent;
  -webkit-text-stroke: 0;
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgb(255 255 255 / 0.55) 50%,
    transparent 58%
  );
  background-size: 260% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: cosmos-sheen 7s ease-in-out 2.2s infinite;
}

.cosmos-hero__bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.cosmos-hero__copy {
  position: relative;
  max-width: 620px;
  animation: cosmos-rise 1.2s var(--cosmos-ease) 0.7s backwards;
}

/* Local darkening so the copy stays legible over bright particles. */
.cosmos-hero__copy::before {
  content: '';
  position: absolute;
  inset: -70px -120px -60px -90px;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(closest-side, rgb(1 3 7 / 0.72), rgb(1 3 7 / 0.36) 55%, transparent);
}

.cosmos-headline {
  margin: 0;
  font-size: clamp(32px, 3.6vw, 56px);
  font-weight: 750;
  line-height: 1.16;
  letter-spacing: 0.01em;
  color: var(--cosmos-ink);
}

.cosmos-headline .is-hl {
  color: var(--cosmos-accent);
  text-shadow: 0 0 34px rgb(112 224 237 / 0.35);
}

.cosmos-lead {
  max-width: 32em;
  margin: 18px 0 0;
  font-size: 15.5px;
  line-height: 1.8;
  color: var(--cosmos-ink-2);
  text-wrap: pretty;
}

.cosmos-hero__actions {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  animation: cosmos-rise 1.2s var(--cosmos-ease) 0.85s backwards;
}

.cosmos-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 56px;
  padding: 0 28px;
  border-radius: 999px;
  font: 700 15px / 1 var(--cosmos-font);
  white-space: nowrap;
  color: var(--cosmos-ink);
  transition:
    transform 0.5s var(--cosmos-ease),
    box-shadow 0.35s;
}

.cosmos-btn:hover {
  transform: translateY(-2px);
}

.cosmos-btn:active {
  transform: scale(0.97);
}

/* Primary: accent-tinted glass with a solid accent orb. */
.cosmos-btn--primary {
  --glass-tint: 112 224 237;
  --glass-tint-alpha: 0.2;
  --glass-blur: 4px;
  --glass-rim: rgb(112 224 237 / 0.55);
  --glass-sheen: rgb(255 255 255 / 0.22);
  padding: 0 9px 0 30px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.3),
    inset 0 0 22px -6px rgb(112 224 237 / 0.5),
    0 24px 60px -22px rgb(112 224 237 / 0.75);
}

.cosmos-btn--primary:hover {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.35),
    inset 0 0 24px -4px rgb(112 224 237 / 0.6),
    0 26px 70px -18px rgb(112 224 237 / 0.9);
}

.cosmos-btn--primary i {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--cosmos-accent);
  color: #04212b;
  transition: transform 0.5s var(--cosmos-ease);
}

.cosmos-btn--primary i svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cosmos-btn--primary:hover i {
  transform: translateX(2px) rotate(-45deg);
}

/* Ghost: clear glass. */
.cosmos-btn--ghost {
  --glass-tint-alpha: 0.035;
  --glass-blur: 2px;
  --glass-rim: rgb(190 240 250 / 0.24);
}

.cosmos-hint {
  position: absolute;
  left: 50%;
  bottom: 24px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  white-space: nowrap;
  color: var(--cosmos-ink-3);
  animation: cosmos-fade 1.2s var(--cosmos-ease) 1.4s backwards;
}

.cosmos-hint i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cosmos-accent);
  box-shadow: 0 0 10px var(--cosmos-accent);
  animation: cosmos-pulse 2.2s ease-in-out infinite;
}

@keyframes cosmos-fade {
  from {
    opacity: 0;
  }
}

@keyframes cosmos-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 24px, 0);
  }
}

@keyframes cosmos-wordmark-in {
  from {
    opacity: 0;
    letter-spacing: 0.02em;
    filter: blur(18px) drop-shadow(0 0 28px rgb(112 224 237 / 0));
  }
}

@keyframes cosmos-sheen {
  0%,
  55% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}

@keyframes cosmos-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 980px) {
  .cosmos-hero__bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 26px;
  }
}

@media (max-width: 760px) {
  .cosmos-hero__inner {
    padding-top: 150px;
  }

  .cosmos-wordmark {
    top: 40%;
  }

  .cosmos-hud,
  .cosmos-hint {
    display: none;
  }

  .cosmos-kicker {
    gap: 10px;
    font-size: 10px;
    letter-spacing: 0.3em;
  }

  .cosmos-kicker i {
    width: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cosmos-kicker,
  .cosmos-wordmark span,
  .cosmos-wordmark span::after,
  .cosmos-hero__copy,
  .cosmos-hero__actions,
  .cosmos-hint,
  .cosmos-hint i {
    animation: none;
  }
}
</style>
