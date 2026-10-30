<template>
  <div ref="rootRef" class="locale">
    <button
      v-liquid-glass="{ scale: 18 }"
      type="button"
      class="locale__trigger liquid-glass landing-clear"
      :disabled="switching"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      :title="t('landingHome.language')"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <span>{{ currentLocale?.code.toUpperCase() }}</span>
      <svg class="locale__chevron" :class="{ 'is-open': isOpen }" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <transition name="locale-menu">
      <div v-if="isOpen" class="locale__menu liquid-glass" role="menu">
        <button
          v-for="option in availableLocales"
          :key="option.code"
          type="button"
          role="menuitemradio"
          class="locale__option"
          :class="{ 'is-active': option.code === currentLocaleCode }"
          :aria-checked="option.code === currentLocaleCode"
          :disabled="switching"
          @click="select(option.code)"
        >
          <span class="locale__code">{{ option.code.toUpperCase() }}</span>
          <span>{{ option.name }}</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import { useLocaleSwitch } from '@/composables/useLocaleSwitch'

const { t } = useI18n()
const rootRef = ref<HTMLElement | null>(null)
const { availableLocales, currentLocale, currentLocaleCode, isOpen, switching, toggle, select } =
  useLocaleSwitch(rootRef)
</script>

<style scoped>
.locale {
  position: relative;
}

.locale__trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  color: var(--landing-ink-2);
  font: 650 12.5px/1 var(--landing-font);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 0.25s;
}

.locale__trigger:hover {
  color: var(--landing-ink);
}

.locale__trigger svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.locale__trigger .locale__chevron {
  width: 12px;
  height: 12px;
  opacity: 0.7;
  transition: transform 0.3s var(--landing-ease);
}

.locale__chevron.is-open {
  transform: rotate(180deg);
}

/* Denser frost than the controls: the menu holds text over a busy backdrop. */
.locale__menu {
  --glass-tint-alpha: 0.78;
  --glass-blur: 20px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
  display: grid;
  gap: 2px;
  min-width: 148px;
  padding: 6px;
  border-radius: 18px;
}

.locale__option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--landing-ink-2);
  font: 600 13px/1 var(--landing-font);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.locale__option:hover,
.locale__option.is-active {
  background: var(--landing-accent-soft);
  color: var(--landing-ink);
}

.locale__code {
  width: 22px;
  font: 700 10.5px/1 var(--landing-mono);
  letter-spacing: 0.12em;
  color: var(--landing-accent);
}

.locale-menu-enter-active,
.locale-menu-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.25s var(--landing-ease);
}

.locale-menu-enter-from,
.locale-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
