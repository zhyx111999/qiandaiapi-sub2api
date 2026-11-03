<template>
  <div class="landing site-page" data-testid="landing-home">
    <PaperBackdrop />
    <OrcaStage :label="t('landingHome.stageLabel')" :wordmark="BRAND.wordmark" />
    <LandingHeader :is-authenticated="isAuthenticated" />
    <main>
      <LandingHero :console-path="consolePath" />
    </main>
  </div>
</template>

<script setup lang="ts">
import '@fontsource-variable/manrope'
import './displayFont.css'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLandingSite } from './useLandingSite'
import { BRAND } from './brand'
import OrcaStage from './orcaStage/OrcaStage.vue'
import LandingHeader from './LandingHeader.vue'
import LandingHero from './LandingHero.vue'
import PaperBackdrop from './PaperBackdrop.vue'

const { t } = useI18n()
const { isAuthenticated, consolePath, refreshSiteState } = useLandingSite()

onMounted(refreshSiteState)
</script>

<style scoped>
/*
 * Palette: ivory paper (primary), warm ink (secondary), plant green (accent, used sparingly);
 * shade is the colour of shadows, daylight the light over the paper, sheen the strength of the
 * glass highlights. Channels are exposed as 'r g b' so the canvas stage can read the same values.
 * The dark theme (chosen in the console) swaps in the console's night palette below.
 */
.landing {
  --landing-paper-rgb: 246 242 234;
  --landing-ink-rgb: 31 29 26;
  --landing-accent-rgb: 59 146 113;
  --landing-frost-rgb: 253 251 247;
  --landing-shade-rgb: 31 29 26;
  --landing-daylight: rgb(255 255 255 / 0.9);
  --landing-sheen: 1;
  --landing-ink: rgb(var(--landing-ink-rgb));
  --landing-ink-2: rgb(var(--landing-ink-rgb) / 0.7);
  --landing-ink-3: rgb(var(--landing-ink-rgb) / 0.46);
  --landing-accent: rgb(var(--landing-accent-rgb));
  --landing-accent-soft: rgb(var(--landing-accent-rgb) / 0.1);
  --landing-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --landing-font: 'Manrope Variable', 'Manrope', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui,
    sans-serif;
  --landing-serif: 'Laoli Display Serif', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', serif;
  --landing-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  position: relative;
  min-height: 100vh;
  overflow-x: clip;
  background: rgb(var(--landing-paper-rgb));
  color: var(--landing-ink);
  font-family: var(--landing-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Dark theme: the console's night paper (dark-950), the field's light ink and green, slate glass. */
:global(.dark) .landing {
  --landing-paper-rgb: 2 6 23;
  --landing-ink-rgb: 235 236 229;
  --landing-accent-rgb: 101 184 150;
  --landing-frost-rgb: 30 41 59;
  --landing-shade-rgb: 0 0 0;
  --landing-daylight: rgb(148 163 184 / 0.1);
  --landing-sheen: 0.35;
  color-scheme: dark;
}

.landing :deep(:focus-visible) {
  outline: 2px solid var(--landing-accent);
  outline-offset: 3px;
}

.landing ::selection {
  background: rgb(var(--landing-accent-rgb) / 0.22);
}
</style>
