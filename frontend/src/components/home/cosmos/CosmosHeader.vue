<template>
  <header class="cosmos-header">
    <div class="cosmos-header__bar">
      <router-link to="/home" class="cosmos-brand">
        <img :src="BRAND.mark" alt="" width="40" height="40" class="cosmos-brand__mark" />
        <span class="cosmos-brand__text">
          <strong>{{ BRAND.name }}</strong>
          <small>{{ BRAND.tagline }}</small>
        </span>
      </router-link>

      <nav
        v-liquid-glass="{ scale: 26, aberration: 3 }"
        class="cosmos-nav liquid-glass"
        :aria-label="t('cosmosHome.nav.label')"
      >
        <router-link
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="cosmos-nav__link"
          :class="{ 'is-active': item.active }"
          :aria-current="item.active ? 'page' : undefined"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <div class="cosmos-header__actions">
        <CosmosLocaleSwitch />
        <router-link
          v-if="!isAuthenticated"
          v-liquid-glass="{ scale: 18 }"
          to="/login"
          class="cosmos-login liquid-glass"
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
import CosmosLocaleSwitch from './CosmosLocaleSwitch.vue'
import { BRAND } from './brand'

const props = defineProps<{
  isAuthenticated: boolean
  platformPath: string
  showModelPlazaEntry: boolean
}>()

const { t } = useI18n()

/** The header only renders on the home page, so "home" is always the current item. */
const items = computed(() => [
  { key: 'home', to: '/home', label: t('cosmosHome.nav.home'), active: true },
  { key: 'platform', to: props.platformPath, label: t('cosmosHome.nav.platform'), active: false },
  ...(props.showModelPlazaEntry
    ? [{ key: 'modelPlaza', to: '/model-plaza', label: t('nav.modelPlaza'), active: false }]
    : []),
])
</script>

<style scoped>
.cosmos-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  padding: 16px clamp(14px, 2.6vw, 40px) 0;
  pointer-events: none;
  /* backwards only: a filled opacity animation would keep a backdrop root and flatten the glass. */
  animation: cosmos-header-in 0.9s var(--cosmos-ease) 0.15s backwards;
}

.cosmos-header__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 18px;
  height: 66px;
  pointer-events: auto;
}

.cosmos-brand {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cosmos-brand__mark {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.08),
    0 10px 30px -12px rgb(112 224 237 / 0.45);
}

.cosmos-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1;
  white-space: nowrap;
}

.cosmos-brand__text strong {
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: var(--cosmos-ink);
}

.cosmos-brand__text small {
  margin-top: 6px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.26em;
  color: var(--cosmos-ink-3);
}

/* Near-clear glass: almost no tint or frost, the refraction rim carries the shape. */
.cosmos-nav {
  --glass-tint-alpha: 0.025;
  --glass-blur: 1.5px;
  --glass-blur-refract: 0.5px;
  --glass-rim: rgb(190 240 250 / 0.16);
  --glass-sheen: rgb(255 255 255 / 0.1);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border-radius: 999px;
}

.cosmos-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--cosmos-ink-2);
  transition:
    color 0.25s,
    background 0.25s;
}

.cosmos-nav__link:hover,
.cosmos-nav__link.is-active {
  color: var(--cosmos-ink);
  background: var(--cosmos-accent-soft);
}

.cosmos-nav__link.is-active::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cosmos-accent);
  box-shadow: 0 0 10px var(--cosmos-accent);
}

.cosmos-header__actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cosmos-login {
  --glass-tint-alpha: 0.03;
  --glass-blur: 2px;
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 650;
  white-space: nowrap;
  color: var(--cosmos-ink);
  transition: transform 0.3s var(--cosmos-ease);
}

.cosmos-login:hover {
  transform: translateY(-1px);
}

@keyframes cosmos-header-in {
  from {
    opacity: 0;
    transform: translate3d(0, -12px, 0);
  }
}

@media (max-width: 760px) {
  .cosmos-header__bar {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'brand actions'
      'nav nav';
    row-gap: 10px;
    height: auto;
  }

  .cosmos-brand {
    grid-area: brand;
  }

  .cosmos-header__actions {
    grid-area: actions;
  }

  .cosmos-nav {
    grid-area: nav;
    justify-self: center;
  }

  .cosmos-nav__link {
    padding: 9px 16px;
  }
}

@media (max-width: 420px) {
  .cosmos-brand__text small {
    display: none;
  }
}
</style>
