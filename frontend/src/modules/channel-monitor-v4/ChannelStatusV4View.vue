<template>
  <AppLayout>
    <V4MonitorHero
      v-model:range="range"
      :status="overall"
      :stale="stale"
      :loading="loading"
      @refresh="reload(false)"
    />

    <div
      v-if="bootstrap"
      class="mb-4 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200"
      role="status"
      data-testid="bootstrap-banner"
    >
      <p class="font-semibold">{{ t('channelMonitorV2.bootstrap.title') }}</p>
      <p class="mt-1 text-xs">{{ t('channelMonitorV2.bootstrap.description') }}</p>
      <p class="mt-1 text-xs tabular-nums">{{ t('channelMonitorV2.bootstrap.progress', { percent: Math.round(bootstrap.progress_percent) }) }}</p>
    </div>

    <div v-if="loading && !cards.length" class="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <div v-for="index in 6" :key="index" class="min-h-[280px] animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-800" />
    </div>
    <EmptyState
      v-else-if="!cards.length"
      :title="t('channelMonitorV4.empty.title')"
      :description="t('channelMonitorV4.empty.description')"
    />
    <div v-else class="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <V4MonitorCard
        v-for="card in cards"
        :key="card.key"
        :card="card"
        :range="range"
        :countdown-seconds="countdown"
        @click="selectedKey = card.key"
      />
    </div>

    <V4MonitorDetailDialog
      :show="selected !== null"
      :card="selected"
      :admin="isAdmin"
      :now="now"
      @close="selectedKey = null"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getMatrix,
  getSnapshot,
  type MonitorFilter,
  type MonitorMatrixResponse,
  type MonitorRange,
  type MonitorSnapshot,
} from '@/api/channelMonitorV2'
import { getUserGroupRates } from '@/api/groups'
import EmptyState from '@/components/common/EmptyState.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { monitorCardTimelineMode, monitorRefreshSeconds } from '@/features/channel-monitor-v2/monitorCards'
import { monitorCardPlatformOrder } from '@/features/channel-monitor-v2/monitorFormat'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorMessage } from '@/utils/apiError'
import { getInsights, type MonitorGroupInsight } from './api'
import { DEFAULT_RANGE, buildCards, worstStatus } from './cards'
import V4MonitorCard from './V4MonitorCard.vue'
import V4MonitorDetailDialog from './V4MonitorDetailDialog.vue'
import V4MonitorHero from './V4MonitorHero.vue'
import { useRefreshClock } from './useRefreshClock'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.isAdmin)

const range = ref<MonitorRange>(DEFAULT_RANGE)
const snapshot = ref<MonitorSnapshot | null>(null)
const matrix = ref<MonitorMatrixResponse | null>(null)
const insights = ref<ReadonlyMap<number, MonitorGroupInsight>>(new Map())
const userRates = ref<Record<number, number>>({})
const loading = ref(false)
const stale = ref(false)
const selectedKey = ref<string | null>(null)

let controller: AbortController | null = null
const { now, countdown, schedule } = useRefreshClock(() => void reload(true))

const bootstrap = computed(() => (snapshot.value?.coverage?.bootstrap?.active ? snapshot.value.coverage.bootstrap : null))
const cards = computed(() =>
  buildCards(matrix.value?.items ?? [], monitorCardPlatformOrder(snapshot.value?.config?.platforms), {
    coverage: matrix.value?.coverage,
    timelineMode: monitorCardTimelineMode(snapshot.value?.config?.card_timeline_mode),
    now: now.value,
    insights: insights.value,
    userRates: userRates.value,
  }),
)
const overall = computed(() => worstStatus(cards.value.map((card) => card.status)))
const selected = computed(() => cards.value.find((card) => card.key === selectedKey.value) ?? null)

async function reload(silent: boolean) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  if (!silent) loading.value = true
  const filter: MonitorFilter = { range: range.value, platforms: [], groupIds: [], models: [] }
  try {
    const [nextSnapshot, nextMatrix, nextRates] = await Promise.all([
      getSnapshot(filter, isAdmin.value, request.signal),
      getMatrix(filter, 'platform_group', isAdmin.value, request.signal, { recentSamples: true }),
      getUserGroupRates(),
    ])
    const groupIds = [...new Set(nextMatrix.items.map((row) => Number(row.group_id)).filter((id) => id > 0))]
    const nextInsights = await getInsights(groupIds, isAdmin.value, request.signal)
    if (request.signal.aborted) return
    snapshot.value = nextSnapshot
    matrix.value = nextMatrix
    userRates.value = nextRates
    insights.value = new Map(nextInsights.map((insight) => [insight.group_id, insight]))
    stale.value = false
  } catch (error) {
    if (request.signal.aborted) return
    stale.value = true
    appStore.showError(extractApiErrorMessage(error, t('channelMonitorV2.loadFailed')))
  } finally {
    if (controller === request) {
      controller = null
      loading.value = false
      schedule(monitorRefreshSeconds(snapshot.value?.config?.refresh_interval_seconds, matrix.value?.items ?? [], Boolean(bootstrap.value)))
    }
  }
}

watch(range, () => void reload(false))
onMounted(() => void reload(false))
onBeforeUnmount(() => controller?.abort())
</script>
