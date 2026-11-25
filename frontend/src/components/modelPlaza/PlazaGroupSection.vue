<template>
  <section class="plaza-group card">
    <!-- 分组头部:名称/平台/倍率徽章/专属/订阅徽章 + 描述 -->
    <header class="plaza-group-header">
      <div class="flex flex-wrap items-center gap-2">
        <GroupBadge
          :name="group.name"
          :platform="group.platform as GroupPlatform"
          :subscription-type="(group.subscription_type || 'standard') as SubscriptionType"
          :rate-multiplier="group.rate_multiplier"
          :user-rate-multiplier="group.user_rate_multiplier ?? null"
          :peak-rate-enabled="group.peak_rate_enabled"
          :peak-start="group.peak_start"
          :peak-end="group.peak_end"
          :peak-rate-multiplier="group.peak_rate_multiplier"
          always-show-rate
        />
        <span v-if="group.is_exclusive" class="plaza-chip">
          <Icon name="shield" size="xs" class="h-3 w-3" />
          {{ t('modelPlaza.badges.exclusive') }}
        </span>
        <span v-if="group.subscription_type === 'subscription'" class="plaza-chip">
          {{ t('modelPlaza.badges.subscription') }}
        </span>
      </div>
      <p v-if="group.description" class="mt-2 text-[13px] text-gray-500 dark:text-dark-400">{{ group.description }}</p>
      <p v-if="peakNote" class="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <Icon name="clock" size="xs" class="h-3 w-3" />
        {{ peakNote }}
      </p>
      <p v-if="longContextNote" class="mt-1.5 flex items-center gap-1 text-xs text-gray-500 dark:text-dark-400">
        <Icon name="infoCircle" size="xs" class="h-3 w-3" />
        {{ longContextNote }}
      </p>
    </header>

    <!-- 每种定价方式一张表，各用对应的列 -->
    <template v-for="bucket in buckets" :key="bucket.kind">
      <PlazaModelPricingTable
        v-if="bucket.kind === 'token'"
        :models="bucket.models"
        :group="group"
        :price-mode="priceMode"
        :price-display="priceDisplay"
        :peak-window="peakWindow"
      />
      <PlazaMediaPricingTable v-else :models="bucket.models" :kind="bucket.kind" :group="group" :price-mode="priceMode" :price-display="priceDisplay" />
      <PlazaNovelAIAddonPricing v-if="bucket.kind === novelAIAddonKind" />
    </template>
    <p v-if="!buckets.length" class="px-5 py-4 text-center text-sm text-gray-400 dark:text-dark-500">
      {{ t('modelPlaza.detail.noModels') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import GroupBadge from '@/components/common/GroupBadge.vue'
import PlazaModelPricingTable from './PlazaModelPricingTable.vue'
import PlazaMediaPricingTable from './PlazaMediaPricingTable.vue'
import PlazaNovelAIAddonPricing from './PlazaNovelAIAddonPricing.vue'
import type { ModelPlazaGroup } from '@/api/modelPlaza'
import type { PlazaPriceDisplay } from '@/utils/plazaCurrency'
import type { GroupPlatform, SubscriptionType } from '@/types'
import { hasPeakRate, formatPeakRateWindow, serverTimezoneLabel } from '@/utils/peak-rate'
import { useAppStore } from '@/stores/app'
import { partitionByPriceKind } from './plazaPriceKind'
import type { PlazaPriceMode } from './plazaRates'

const props = defineProps<{
  group: ModelPlazaGroup
  priceMode: PlazaPriceMode
  priceDisplay?: PlazaPriceDisplay
}>()

const { t } = useI18n()
const appStore = useAppStore()

const buckets = computed(() => partitionByPriceKind(props.group.models))

// Follow the visible NovelAI image table (including composite groups), once per group.
// Prefer the pixel/resolution table; flat-price NovelAI models use the request table instead.
const novelAIAddonKind = computed(() => buckets.value.find((bucket) =>
  bucket.kind !== 'token' && bucket.models.some((model) => model.platform === 'novelai')
)?.kind)

/** 高峰窗口描述(含倍率与服务器时区标注);分组未启用高峰为空串。 */
const peakWindow = computed(() => {
  if (!hasPeakRate(props.group)) return ''
  return formatPeakRateWindow(props.group, serverTimezoneLabel(appStore.cachedPublicSettings?.server_utc_offset))
})

const peakNote = computed(() => {
  if (!peakWindow.value) return ''
  return t('modelPlaza.detail.peakNote', { window: peakWindow.value, multiplier: props.group.peak_rate_multiplier })
})

/**
 * 分组关闭了长上下文阶梯、但组内有模型官方带阶梯时提示:实付列只展示基础档,
 * 官方阶梯仅供参考。字段缺失(旧后端)不提示。
 */
const longContextNote = computed(() => {
  if (props.group.long_context_pricing_enabled !== false) return ''
  const hasOfficialLadder = props.group.models.some((m) => (m.official_pricing?.intervals?.length ?? 0) > 1)
  return hasOfficialLadder ? t('modelPlaza.detail.longContextDisabledNote') : ''
})
</script>

<style scoped>
.plaza-group {
  min-width: 0;
  overflow: hidden;
}

.plaza-group-header {
  padding: 16px 20px;
  @apply border-b border-gray-100 dark:border-dark-700/60;
}

.plaza-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  @apply bg-gray-100/80 text-gray-600 dark:bg-dark-700/60 dark:text-dark-300;
}

/* 多张表上下相接：表头区一层浅底，表与表之间一道细线。 */
.plaza-group :deep(.plaza-table + .plaza-table) {
  @apply border-t border-gray-100 dark:border-dark-700/60;
}

.plaza-group :deep(.plaza-table thead) {
  @apply bg-gray-50/70 dark:bg-dark-800/40;
}
</style>
