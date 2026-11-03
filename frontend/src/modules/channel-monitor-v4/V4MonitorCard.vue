<!--
  v4 group card. Layout follows the monitor card of hongkong7530/sub2api-xigong
  (https://github.com/hongkong7530/sub2api-xigong, LGPL-3.0): real-request first
  token and output rate, effective rate and 30-minute cache rate, recent first
  tokens, availability and the history strip. The strip and the status keep the
  candy probes (reasoning-quality checks) of v4.
-->
<template>
  <button
    type="button"
    class="group text-left p-5 rounded-2xl min-h-[310px] w-full bg-white/70 backdrop-blur-xl border border-gray-200/80 shadow-card dark:bg-dark-800/60 dark:border-dark-700/70 hover:-translate-y-1 hover:shadow-card-hover dark:hover:border-primary-500/30 hover:border-gray-300 transition-all duration-300 ease-out flex flex-col"
    @click="emit('click')"
  >
    <div class="flex items-start gap-3">
      <span
        class="w-9 h-9 rounded-xl ring-1 ring-black/5 dark:ring-white/10 grid place-items-center flex-shrink-0"
        :class="[providerGradient(card.platform), platformTextClass(card.platform)]"
      >
        <ProviderIcon :provider="card.platform" :size="20" />
      </span>
      <div class="flex-1 min-w-0">
        <h3 class="text-base font-semibold truncate text-gray-900 dark:text-gray-100" :title="card.name">{{ card.name }}</h3>
        <div class="mt-0.5 flex items-center gap-1.5 min-w-0">
          <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold flex-shrink-0" :class="providerBadgeClass(card.platform)">
            {{ providerLabel(card.platform) }}
          </span>
          <span v-if="card.model" class="font-mono text-sm truncate text-gray-600 dark:text-gray-300" :title="card.model">{{ card.model }}</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0" :class="statusBadgeClass(card.status)">
        {{ card.status ? statusLabel(card.status) : t('channelMonitorV4.overall.unknown') }}
      </span>
    </div>

    <MonitorMetricPair
      primary-icon="bolt"
      :primary-label="t('channelMonitorV4.card.latestFirstToken')"
      :primary-value="formatLatency(card.latestFirstToken)"
      primary-unit="ms"
      secondary-icon="bolt"
      :secondary-label="t('channelMonitorV4.card.outputRate')"
      :secondary-value="outputRate"
      secondary-unit="tok/s"
    />

    <div class="mt-3 grid grid-cols-2 gap-2">
      <span class="flex flex-col rounded-lg bg-sky-50 px-3 py-2.5 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" data-testid="v4-effective-rate">
        <span class="text-xs font-medium opacity-75">{{ t('channelMonitorV4.card.effectiveRate') }}</span>
        <strong class="mt-0.5 text-base font-black tabular-nums">{{ card.rate == null ? '—' : `×${card.rate.toFixed(4)}` }}</strong>
      </span>
      <span class="flex flex-col rounded-lg bg-emerald-50 px-3 py-2.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="v4-cache-rate">
        <span class="text-xs font-medium opacity-75">{{ t('channelMonitorV4.card.cacheRate') }}</span>
        <strong class="mt-0.5 text-base font-black tabular-nums">{{ card.cacheRate == null ? '—' : `${(card.cacheRate * 100).toFixed(1)}%` }}</strong>
      </span>
    </div>

    <V4FirstTokenSamples :samples="card.samples" />

    <div class="mt-4 border-t border-gray-100 dark:border-dark-700/60"></div>

    <MonitorAvailabilityRow
      :window-label="`${t('channelMonitorV4.card.availability')} · ${t(`channelMonitorV2.ranges.${range}`)}`"
      :value="card.availability"
      :samples-label="notes"
    />

    <MonitorTimeline :buckets="card.timeline" :length="card.timelineLength" :countdown-seconds="countdownSeconds" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MonitorRange } from '@/api/channelMonitorV2'
import MonitorAvailabilityRow from '@/components/user/monitor/MonitorAvailabilityRow.vue'
import MonitorMetricPair from '@/components/user/monitor/MonitorMetricPair.vue'
import MonitorTimeline from '@/components/user/monitor/MonitorTimeline.vue'
import ProviderIcon from '@/components/user/monitor/ProviderIcon.vue'
import { providerGradient, useChannelMonitorFormat } from '@/composables/useChannelMonitorFormat'
import { platformTextClass } from '@/utils/platformColors'
import type { MonitorCard } from './cards'
import V4FirstTokenSamples from './V4FirstTokenSamples.vue'

const props = defineProps<{
  card: MonitorCard
  range: MonitorRange
  countdownSeconds: number
}>()

const emit = defineEmits<{ (e: 'click'): void }>()

const { t } = useI18n()
const { statusLabel, statusBadgeClass, providerLabel, providerBadgeClass, formatLatency } = useChannelMonitorFormat()

const outputRate = computed(() => (props.card.outputRate == null ? '—' : props.card.outputRate.toFixed(1)))

// Under the availability figure: how the group's probes answered, and how many more models are probed.
const notes = computed(() => {
  const parts = [
    props.card.candyAccuracy == null ? '' : t('channelMonitorV4.card.candyAccuracy', { value: props.card.candyAccuracy.toFixed(0) }),
    props.card.extraModels ? t('monitorCommon.extraModelsCount', { n: props.card.extraModels }) : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
})
</script>
