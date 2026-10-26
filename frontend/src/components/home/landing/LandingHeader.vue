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

      <nav
        v-liquid-glass="{ scale: 26, aberration: 2 }"
        class="landing-nav liquid-glass"
        :aria-label="t('landingHome.nav.label')"
      >
        <router-link
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="landing-nav__link"
          :class="{ 'is-active': item.active }"
          :aria-current="item.active ? 'page' : undefined"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <div class="landing-header__actions">
        <LandingLocaleSwitch />
        <router-link
          v-if="!isAuthenticated"
          v-liquid-glass="{ scale: 18 }"
          to="/login"
          class="landing-login liquid-glass"
        >
          {{ t('home.login') }}
        </router-link>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import LandingLocaleSwitch from './LandingLocaleSwitch.vue'
import { BRAND } from './brand'

const props = defineProps<{
  isAuthenticated: boolean
  platformPath: string
}>()

const { t } = useI18n()

/** The header only renders on the home page, so "home" is always the current item. */
const items = computed(() => [
  { key: 'home', to: '/home', label: t('landingHome.nav.home'), active: true },
  { key: 'platform', to: props.platformPath, label: t('landingHome.nav.platform'), active: false },
])
</script>

<style scoped>
.landing-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  padding: 16px clamp(14px, 2.6vw, 40px) 0;
  pointer-events: none;
  /* backwards only: a filled opacity animation would keep a backdrop root and flatten the glass. */
  animation: landing-header-in 0.9s var(--landing-ease) 0.15s backwards;
}

.landing-header__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 18px;
  height: 66px;
  pointer-events: auto;
}

.landing-brand {
  justify-self: start;
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

/* Frosted white pill; the strands behind it show through softened and bent at the rim. */
.landing-nav {
  --glass-tint-alpha: 0.38;
  --glass-blur: 14px;
  --glass-blur-refract: 7px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border-radius: 999px;
}

.landing-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--landing-ink-2);
  transition:
    color 0.25s,
    background 0.25s;
}

.landing-nav__link:hover {
  color: var(--landing-ink);
  background: rgb(var(--landing-ink-rgb) / 0.05);
}

.landing-nav__link.is-active {
  color: var(--landing-ink);
  background: rgb(255 255 255 / 0.7);
  box-shadow: 0 1px 3px rgb(var(--landing-ink-rgb) / 0.08);
}

.landing-nav__link.is-active::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--landing-accent);
}

.landing-header__actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
}

.landing-login {
  --glass-tint-alpha: 0.4;
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

@media (max-width: 760px) {
  .landing-header__bar {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'brand actions'
      'nav nav';
    row-gap: 10px;
    height: auto;
  }

  .landing-brand {
    grid-area: brand;
  }

  .landing-header__actions {
    grid-area: actions;
  }

  .landing-nav {
    grid-area: nav;
    justify-self: center;
  }

  .landing-nav__link {
    padding: 9px 16px;
  }
}

@media (max-width: 420px) {
  .landing-brand__text small {
    display: none;
  }
}
</style>
