<!--
  Recent real-request first tokens of a v4 card.
  Adapted from MonitorFirstTokenSamples.vue of hongkong7530/sub2api-xigong
  (https://github.com/hongkong7530/sub2api-xigong, LGPL-3.0): same layout and
  10s/30s/60s colour bands, fed by the v4 insights instead of probe history.
-->
<template>
  <section class="mt-4 min-w-0 border-t border-gray-100 pt-3 dark:border-dark-700/60" data-testid="v4-first-token-samples">
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
      <h4 class="font-semibold text-gray-700 dark:text-gray-200">{{ t('channelMonitorV4.card.realFirstTokens') }}</h4>
      <span class="tabular-nums">{{ t('channelMonitorV4.card.firstTokenSamples', { n: samples.length }) }}</span>
    </div>
    <div class="mt-2 flex items-baseline gap-2">
      <strong class="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100" data-testid="first-token-latest">{{ latestLabel }}</strong>
      <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('channelMonitorV4.card.firstTokenLatest') }}</span>
    </div>
    <div
      v-if="samples.length"
      class="mt-2 grid h-6 items-end gap-0.5"
      :style="{ gridTemplateColumns: `repeat(${FIRST_TOKEN_SAMPLES}, minmax(0, 1fr))` }"
    >
      <span
        v-for="(sample, index) in chronological"
        :key="index"
        role="img"
        class="min-w-0 rounded-sm"
        :class="BAR_CLASSES[firstTokenSeverity(sample.first_token_ms)]"
        :style="{ height: BAR_HEIGHTS[firstTokenSeverity(sample.first_token_ms)] }"
        :title="sampleTitle(sample)"
        :aria-label="sampleTitle(sample)"
      ></span>
    </div>
    <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">{{ t('channelMonitorV4.card.realFirstTokensEmpty') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { firstTokenSeverity, type LatencySeverity } from '@/utils/latencyHealth'
import type { MonitorRequestSample } from './api'
import { FIRST_TOKEN_SAMPLES } from './cards'

const props = defineProps<{ samples: readonly MonitorRequestSample[] }>()
const { t } = useI18n()

const BAR_CLASSES: Record<LatencySeverity, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-400',
  slow: 'bg-orange-500',
  critical: 'bg-red-500',
}
const BAR_HEIGHTS: Record<LatencySeverity, string> = { good: '100%', warn: '75%', slow: '50%', critical: '30%' }

// Oldest on the left, like the timeline below.
const chronological = computed(() => [...props.samples].reverse())
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`
const latestLabel = computed(() => (props.samples.length ? seconds(props.samples[0].first_token_ms) : '-'))
const sampleTitle = (sample: MonitorRequestSample) => `${seconds(sample.first_token_ms)} · ${new Date(sample.at).toLocaleString()}`
</script>
