<template>
  <div class="space-y-4">
    <!-- 页头(独立形态下展示标题;后台形态 AppHeader 已有页面标题) -->
    <div v-if="!embedded">
      <h1 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">{{ t('modelPlaza.title') }}</h1>
      <p class="mt-1.5 text-sm text-gray-500 dark:text-dark-400">{{ t('modelPlaza.description') }}</p>
    </div>

    <!-- 未登录提示 -->
    <p v-if="!isAuthenticated" class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-dark-500">
      <Icon name="infoCircle" size="xs" class="h-3.5 w-3.5" />
      {{ t('modelPlaza.anonymousHint') }}
    </p>

    <div v-if="loading" class="flex min-h-[240px] items-center justify-center">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-600/25 border-t-primary-600 dark:border-primary-400/25 dark:border-t-primary-400"></div>
    </div>
    <div v-else-if="error" class="plaza-status plaza-status-error">{{ t('modelPlaza.loadFailed') }}</div>
    <template v-else>
      <PlazaVendorTabs v-model="selectedVendor" :vendors="vendors" :enabled="vendorEnabled" />

      <!-- 全局价格说明(管理员配置,Markdown) -->
      <div v-if="descriptionHtml" class="plaza-description card px-5 py-3 text-sm">
        <span class="plaza-description-title">
          <Icon name="infoCircle" size="sm" class="h-4 w-4 text-primary-600 dark:text-primary-400" />
          {{ t('modelPlaza.pricingRules') }}
        </span>
        <div class="min-w-0 flex-1" v-html="descriptionHtml"></div>
      </div>

      <PlazaFilterBar
        v-model:group-id="selectedGroupId"
        v-model:rate="selectedRate"
        v-model:search="searchQuery"
        v-model:price-mode="priceMode"
        :groups="filterGroups"
        :rates="rates"
        :vendor="selectedVendor"
      />

      <!-- 分组分节的模型清单(按生效倍率升序) -->
      <div v-if="filteredGroups.length > 0" class="space-y-4">
        <PlazaGroupSection v-for="g in filteredGroups" :key="g.id" :group="g" :price-mode="priceMode" />
      </div>
      <div v-else class="plaza-status">
        {{ searchActive ? t('modelPlaza.noSearchResult') : t('modelPlaza.empty') }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Icon from '@/components/icons/Icon.vue'
import PlazaVendorTabs from './PlazaVendorTabs.vue'
import PlazaFilterBar, { type PlazaFilterGroup } from './PlazaFilterBar.vue'
import PlazaGroupSection from './PlazaGroupSection.vue'
import type { ModelPlazaGroup, ModelPlazaResponse } from '@/api/modelPlaza'
import { useAuthStore } from '@/stores/auth'
import { vendorOf } from './plazaVendors'
import { effectiveRate, type PlazaPriceMode } from './plazaRates'

const props = defineProps<{
  response: ModelPlazaResponse | null
  loading: boolean
  error?: boolean
  /** 后台内嵌形态(AppLayout 内):隐藏页头。 */
  embedded?: boolean
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const isAuthenticated = computed(() => authStore.isAuthenticated)

const selectedVendor = ref('all')
const selectedGroupId = ref<number | 'all'>('all')
const selectedRate = ref<number | 'all'>('all')
const searchQuery = ref('')
const priceMode = ref<PlazaPriceMode>('group')

const searchActive = computed(() => searchQuery.value.trim() !== '')

const descriptionHtml = computed(() => {
  const md = props.response?.description?.trim()
  if (!md) return ''
  return DOMPurify.sanitize(marked.parse(md) as string)
})

/** 模型名搜索后的分组（组内只留命中模型，无命中的分组去掉）。 */
const searchedGroups = computed<ModelPlazaGroup[]>(() => {
  const groups = props.response?.groups ?? []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return groups
  return groups
    .map((g) => ({ ...g, models: g.models.filter((m) => m.name.toLowerCase().includes(q)) }))
    .filter((g) => g.models.length > 0)
})

/** 厂商按数据中出现的顺序（分组已按倍率升序）。 */
const vendors = computed(() => [
  ...new Set((props.response?.groups ?? []).flatMap((g) => g.models.map(vendorOf)))
])

const filterGroups = computed<PlazaFilterGroup[]>(() =>
  searchedGroups.value.map((g) => ({
    id: g.id,
    name: g.name,
    rate: effectiveRate(g),
    vendors: new Set(g.models.map(vendorOf))
  }))
)

const rates = computed(() =>
  [...new Set((props.response?.groups ?? []).map(effectiveRate))].sort((a, b) => a - b)
)

function vendorEnabled(id: string): boolean {
  return filterGroups.value.some(
    (g) =>
      g.vendors.has(id) &&
      (selectedGroupId.value === 'all' || g.id === selectedGroupId.value) &&
      (selectedRate.value === 'all' || g.rate === selectedRate.value)
  )
}

/** 数据刷新后已选的厂商 / 倍率可能不复存在，重置为全部。 */
watch(vendors, (list) => {
  if (selectedVendor.value !== 'all' && !list.includes(selectedVendor.value)) selectedVendor.value = 'all'
})
watch(rates, (list) => {
  if (selectedRate.value !== 'all' && !list.includes(selectedRate.value)) selectedRate.value = 'all'
})

const filteredGroups = computed(() => {
  let groups = searchedGroups.value
  if (selectedVendor.value !== 'all') {
    groups = groups
      .map((g) => ({ ...g, models: g.models.filter((m) => vendorOf(m) === selectedVendor.value) }))
      .filter((g) => g.models.length > 0)
  }
  if (selectedGroupId.value !== 'all') groups = groups.filter((g) => g.id === selectedGroupId.value)
  if (selectedRate.value !== 'all') groups = groups.filter((g) => effectiveRate(g) === selectedRate.value)
  // 专属倍率会改变生效值，不能只依赖后端按默认倍率的排序。
  return [...groups].sort((a, b) => effectiveRate(a) - effectiveRate(b) || a.name.localeCompare(b.name))
})
</script>

<style scoped>
.plaza-status {
  padding: 48px 20px;
  border-radius: 1rem;
  text-align: center;
  font-size: 14px;
  @apply border border-dashed border-gray-300 text-gray-500 dark:border-dark-600 dark:text-dark-400;
}

.plaza-status-error {
  @apply border-solid border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300;
}

.plaza-description {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  @apply text-gray-600 dark:text-dark-300;
}

.plaza-description-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  font-weight: 700;
  @apply text-gray-900 dark:text-white;
}

.plaza-description :deep(p) {
  @apply mb-1 last:mb-0;
}

.plaza-description :deep(a) {
  @apply text-primary-600 underline underline-offset-4 hover:text-primary-700 dark:text-primary-300;
}

.plaza-description :deep(ul) {
  @apply list-disc pl-5;
}

.plaza-description :deep(ol) {
  @apply list-decimal pl-5;
}

.plaza-description :deep(code) {
  @apply rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-dark-800;
}
</style>
