<template>
  <section class="py-3 md:py-4">
    <div class="flex items-center justify-end gap-3 flex-wrap">
      <div
        role="tablist"
        class="inline-flex p-0.5 rounded-xl bg-gray-100 dark:bg-dark-800 border border-gray-200/60 dark:border-dark-700/60 text-xs"
      >
        <button
          v-for="value in MONITOR_RANGES"
          :key="value"
          type="button"
          role="tab"
          :aria-selected="range === value"
          class="px-3 py-1 rounded-lg transition-colors"
          :class="range === value
            ? 'bg-white dark:bg-dark-700 shadow-sm text-gray-900 dark:text-white font-semibold'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
          @click="emit('update:range', value)"
        >
          {{ t(`channelMonitorV2.ranges.${value}`) }}
        </button>
      </div>

      <span
        class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase"
        :class="statusBadgeClass(stale ? '' : status)"
      >
        <span class="w-1.5 h-1.5 rounded-full mr-1.5 bg-current animate-pulse"></span>
        {{ t(`channelMonitorV4.overall.${stale ? 'stale' : status || 'unknown'}`) }}
      </span>

      <button
        type="button"
        class="h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-dark-700 transition-colors disabled:opacity-50"
        :disabled="loading"
        :title="t('common.refresh')"
        @click="emit('refresh')"
      >
        <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MonitorRange } from '@/api/channelMonitorV2'
import Icon from '@/components/icons/Icon.vue'
import { useChannelMonitorFormat } from '@/composables/useChannelMonitorFormat'
import { MONITOR_RANGES, type CardStatus } from './cards'

defineProps<{
  status: CardStatus
  /** The last refresh failed, so the status may be out of date. */
  stale: boolean
  range: MonitorRange
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:range', value: MonitorRange): void
  (e: 'refresh'): void
}>()

const { t } = useI18n()
const { statusBadgeClass } = useChannelMonitorFormat()
</script>
