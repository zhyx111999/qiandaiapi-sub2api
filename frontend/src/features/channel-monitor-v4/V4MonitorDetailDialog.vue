<template>
  <BaseDialog :show="show" :title="card?.name ?? ''" width="wide" @close="emit('close')">
    <div v-if="card" class="space-y-6 overflow-x-auto">
      <section>
        <h3 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('channelMonitorV4.detail.candyTitle') }}</h3>
        <table v-if="histories.length" class="w-full text-left text-sm" data-testid="candy-table">
          <thead class="border-b border-gray-200 dark:border-dark-700">
            <tr class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.model') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.latest') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.latestLatency') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.accuracy') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.meanLatency') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="history in histories" :key="candyLabel(history)" class="border-b border-gray-100 dark:border-dark-800">
              <td class="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100">{{ candyLabel(history) }}</td>
              <td class="py-2 pr-3">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]" :class="statusBadgeClass(candyStatus(history, now))">
                  {{ t(`channelMonitorV2.candy.states.${candyDisplayState(history, now)}`) }}
                </span>
              </td>
              <td class="py-2 pr-3 text-gray-700 dark:text-gray-300">{{ formatMonitorMs(candyLatency(history)) }}</td>
              <td class="py-2 pr-3 text-gray-700 dark:text-gray-300">{{ formatPercent(candyStats([history]).accuracy) }}</td>
              <td class="py-2 pr-3 text-gray-700 dark:text-gray-300">{{ formatMonitorMs(candyStats([history]).meanLatency) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-gray-500">{{ t('channelMonitorV4.detail.noCandy') }}</p>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('channelMonitorV4.detail.passiveTitle') }}</h3>
        <p v-if="loading" class="py-4 text-center text-sm text-gray-500">{{ t('common.loading') }}</p>
        <p v-else-if="failed" class="py-4 text-center text-sm text-gray-500">{{ t('channelMonitorV4.detail.loadFailed') }}</p>
        <p v-else-if="!models.length" class="text-sm text-gray-500">{{ t('channelMonitorV4.detail.noPassive') }}</p>
        <table v-else class="w-full text-left text-sm" data-testid="passive-table">
          <thead class="border-b border-gray-200 dark:border-dark-700">
            <tr class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.model') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.health') }}</th>
              <th class="py-2 pr-3">{{ t('channelMonitorV4.detail.ttft') }}</th>
              <th v-for="range in DETAIL_RANGES" :key="range" class="py-2 pr-3">
                {{ t('channelMonitorV4.detail.availability', { range: t(`channelMonitorV2.ranges.${range}`) }) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in models" :key="model.model" class="border-b border-gray-100 dark:border-dark-800">
              <td class="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100">{{ model.model }}</td>
              <td class="py-2 pr-3">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]" :class="statusBadgeClass(healthStatus(model.health))">
                  {{ t(`channelMonitorV2.cards.health.${model.health}`) }}
                </span>
              </td>
              <td class="py-2 pr-3 text-gray-700 dark:text-gray-300">{{ formatMonitorMs(model.ttft) }}</td>
              <td v-for="(range, index) in DETAIL_RANGES" :key="range" class="py-2 pr-3 text-gray-700 dark:text-gray-300">
                {{ formatPercent(model.availability[index]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button type="button" class="btn btn-secondary" @click="emit('close')">{{ t('channelStatus.closeDetail') }}</button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getModels } from '@/api/channelMonitorV2'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useChannelMonitorFormat } from '@/composables/useChannelMonitorFormat'
import { candyDisplayState, monitorCandyHistories } from '@/features/channel-monitor-v2/monitorCards'
import { formatMonitorMs } from '@/features/channel-monitor-v2/monitorFormat'
import {
  DETAIL_RANGES,
  candyLabel,
  candyLatency,
  candyStats,
  candyStatus,
  healthStatus,
  modelDetails,
  type ModelDetail,
  type MonitorCard,
} from './cards'

const props = defineProps<{
  show: boolean
  card: MonitorCard | null
  /** Administrators read the admin endpoints, like the v2 page. */
  admin: boolean
  now: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const { statusBadgeClass, formatPercent } = useChannelMonitorFormat()

const histories = computed(() => (props.card ? monitorCandyHistories(props.card.row) : []))
const models = ref<ModelDetail[]>([])
const loading = ref(false)
const failed = ref(false)

// The card is rebuilt on every refresh, so only the group decides when to load.
watch(
  [() => props.show, () => props.card?.key],
  ([show], _, onCleanup) => {
    models.value = []
    failed.value = false
    const card = props.card
    if (!show || !card) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    loading.value = true
    Promise.all(
      DETAIL_RANGES.map((range) =>
        getModels({ range, platforms: [card.platform], groupIds: [card.groupId], models: [] }, props.admin, controller.signal),
      ),
    )
      .then((responses) => {
        models.value = modelDetails(responses.map((response) => response.items || []))
      })
      .catch(() => {
        if (!controller.signal.aborted) failed.value = true
      })
      .finally(() => {
        if (!controller.signal.aborted) loading.value = false
      })
  },
  { immediate: true },
)
</script>
