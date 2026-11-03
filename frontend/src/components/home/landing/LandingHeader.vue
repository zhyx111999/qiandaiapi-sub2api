<template>
  <header class="landing-header">
    <div class="landing-header__bar">
      <router-link to="/home" class="landing-brand">
        <img :src="BRAND.mark" alt="" width="40" height="40" class="landing-brand__mark" />
        <span class="landing-brand__text">
          <strong>{{ BRAND.name }}</strong>
          <small>{{ BRAND.tagline }}</small>
        </span>
      </router-link>

      <div class="landing-header__actions">
        <LandingLocaleSwitch />
        <router-link
          v-if="!isAuthenticated"
          :ref="setLogin"
          v-liquid-glass="{ scale: 18 }"
          to="/login"
          class="landing-login liquid-glass clear-glass"
        >
          {{ t('home.login') }}
        </router-link>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLightRim } from '@/components/layout/consoleLight'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import LandingLocaleSwitch from './LandingLocaleSwitch.vue'
import { BRAND } from './brand'

/** Brand on the left, language and sign-in on the right; the site nav (SiteNav) floats between. */
defineProps<{
  isAuthenticated: boolean
}>()

const { t } = useI18n()

/** The login button's glass rim follows the light. */
const loginEl = ref<HTMLElement | null>(null)
const setLogin = (link: Element | ComponentPublicInstance | null) => {
  const node = link && '$el' in link ? link.$el : link
  loginEl.value = node instanceof HTMLElement ? node : null
}
useLightRim(loginEl)
</script>

<style scoped>
.landing-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  padding: 0 clamp(14px, 2.6vw, 40px);
  pointer-events: none;
  /* backwards only: a filled opacity animation would keep a backdrop root and flatten the glass. */
  animation: landing-header-in 0.9s var(--landing-ease) 0.15s backwards;
}

/* 64px row: its centre line (y = 32) is the site nav's and the console top bar's. */
.landing-header__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  height: 64px;
  pointer-events: none;
}

.landing-header__bar > * {
  pointer-events: auto;
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.landing-brand__mark {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  box-shadow:
    0 0 0 1px rgb(var(--landing-ink-rgb) / 0.06),
    0 8px 22px -10px rgb(var(--landing-ink-rgb) / 0.45);
}

.landing-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1;
  white-space: nowrap;
}

.landing-brand__text strong {
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: var(--landing-ink);
}

.landing-brand__text small {
  margin-top: 6px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.26em;
  color: var(--landing-ink-3);
}

.landing-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.landing-login {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 650;
  white-space: nowrap;
  color: var(--landing-ink);
  transition: transform 0.3s var(--landing-ease);
}

.landing-login:hover {
  transform: translateY(-1px);
}

@keyframes landing-header-in {
  from {
    opacity: 0;
    transform: translate3d(0, -12px, 0);
  }
}

@media (max-width: 420px) {
  .landing-brand__text small {
    display: none;
  }
}
</style>
