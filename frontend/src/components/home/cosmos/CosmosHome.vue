<template>
  <div class="cosmos" data-testid="cosmos-home">
    <DeepSpaceBackdrop />
    <ThreeBodyStage :label="t('cosmosHome.stageLabel')" />
    <CosmosHeader
      :is-authenticated="isAuthenticated"
      :platform-path="platformPath"
      :show-model-plaza-entry="showModelPlazaEntry"
    />
    <main>
      <CosmosHero :console-path="consolePath" :explore-path="platformPath" />
    </main>
  </div>
</template>

<script setup lang="ts">
import '@fontsource-variable/manrope'
import { useI18n } from 'vue-i18n'
import { useHomeSite } from '../useHomeSite'
import CosmosHeader from './CosmosHeader.vue'
import CosmosHero from './CosmosHero.vue'
import DeepSpaceBackdrop from './DeepSpaceBackdrop.vue'
import ThreeBodyStage from './threeBody/ThreeBodyStage.vue'

const { t } = useI18n()
const { isAuthenticated, consolePath, showModelPlazaEntry } = useHomeSite()

/** There is no dedicated platform page yet; "平台" and "探索平台" lead into the console. */
const platformPath = consolePath
</script>

<style scoped>
.cosmos {
  --cosmos-ink: #f2f7fa;
  --cosmos-ink-2: rgb(222 238 246 / 0.74);
  --cosmos-ink-3: rgb(190 218 232 / 0.5);
  --cosmos-accent: #70e0ed;
  --cosmos-accent-soft: rgb(112 224 237 / 0.08);
  --cosmos-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --cosmos-font: 'Manrope Variable', 'Manrope', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui,
    sans-serif;
  --cosmos-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  position: relative;
  min-height: 100vh;
  overflow-x: clip;
  background: #010204;
  color: var(--cosmos-ink);
  font-family: var(--cosmos-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.cosmos :deep(:focus-visible) {
  outline: 2px solid var(--cosmos-accent);
  outline-offset: 3px;
}

.cosmos ::selection {
  background: rgb(112 224 237 / 0.32);
}
</style>
