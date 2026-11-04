<template>
  <div class="plaza-table overflow-x-auto">
    <table class="w-full min-w-[640px] table-auto border-collapse text-sm tabular-nums">
      <thead>
        <tr class="text-left text-xs font-semibold text-gray-500 dark:text-dark-400">
          <th class="w-[34%] py-2.5 pl-5 pr-4">{{ t('modelPlaza.table.model') }}</th>
          <template v-if="kind === 'resolution'">
            <th v-for="col in tierColumns" :key="col.key" class="px-3 py-2.5 align-bottom" :data-tier="col.key">
              {{ col.label }}
              <span v-if="col.span" class="block whitespace-nowrap font-mono text-[11px] font-normal text-gray-400 dark:text-dark-500">{{ col.span }}</span>
            </th>
          </template>
          <th v-else class="px-3 py-2.5">{{ t('modelPlaza.table.perRequestPrice') }}</th>
          <th v-if="showReference" class="px-3 py-2.5">{{ t('modelPlaza.table.referenceImage') }}</th>
          <th v-if="showRate" class="py-2.5 pl-3 pr-5 text-right">{{ t('modelPlaza.table.rate') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="m in sortedModels"
          :key="`${m.platform}:${m.name}`"
          class="border-t border-gray-100 transition-colors hover:bg-white/50 dark:border-dark-800 dark:hover:bg-white/[0.03]"
        >
          <td class="py-3 pl-5 pr-4 align-middle">
            <PlazaModelName :name="m.name">
              <span
                v-if="group.platform && m.platform !== group.platform"
                :class="['rounded-md px-1.5 py-0.5 text-[10px] font-medium', platformBadgeLightClass(m.platform)]"
              >
                {{ platformLabel(m.platform) }}
              </span>
            </PlazaModelName>
          </td>

          <!-- 按分辨率：每档一列；档位覆盖范围各行不一致时写在单元格里 -->
          <template v-if="kind === 'resolution'">
            <td v-for="col in tierColumns" :key="col.key" class="px-3 py-3 align-middle" :data-tier="col.key">
              <template v-if="tierOf(m, col.key)">
                <span class="plaza-price">{{ paid(m, tierOf(m, col.key)!.price) }}</span>
                <span class="plaza-unit">{{ unit(m) }}</span>
                <div v-if="!col.span" class="whitespace-nowrap font-mono text-[11px] text-gray-400 dark:text-dark-500">
                  {{ tierSpan(tierOf(m, col.key)!) }}
                </div>
              </template>
              <span v-else class="text-gray-400 dark:text-dark-500">-</span>
            </td>
          </template>

          <!-- 按次：单一单价；按上下文分档的按次模型逐档列出 -->
          <td v-else class="px-3 py-3 align-middle">
            <template v-if="flatRequestPrice(m) != null">
              <span class="plaza-price">{{ paid(m, flatRequestPrice(m)) }}</span>
              <span class="plaza-unit">{{ unit(m) }}</span>
            </template>
            <div v-else-if="requestIntervals(m).length" class="flex flex-wrap gap-1.5">
              <span v-for="(iv, idx) in requestIntervals(m)" :key="idx" class="plaza-chip">
                <span class="text-gray-400 dark:text-dark-500">{{ contextTierLabel(iv) }}</span>
                <span class="plaza-price">{{ paid(m, iv.per_request_price) }}</span>
              </span>
            </div>
            <span v-else class="text-gray-400 dark:text-dark-500">-</span>
          </td>

          <td v-if="showReference" class="px-3 py-3 align-middle">
            <template v-if="!isOfficial && m.image?.reference_image_price != null">
              <span class="plaza-price">{{ paid(m, m.image.reference_image_price) }}</span>
              <span class="plaza-unit">{{ t('modelPlaza.table.perUnitImage') }}</span>
            </template>
            <span v-else class="text-gray-400 dark:text-dark-500">-</span>
          </td>

          <!-- 倍率：图片 / 视频独立倍率覆盖分组倍率；专属倍率划线展示原倍率 -->
          <td v-if="showRate" class="py-3 pl-3 pr-5 text-right align-middle font-mono text-xs">
            <template v-if="!usesIndependentMediaRate(group, m) && hasCustomRate(group)">
              <span class="mr-1 text-gray-400 line-through dark:text-dark-500">{{ group.rate_multiplier }}x</span>
              <span class="font-bold text-primary-600 dark:text-primary-400">{{ mediaRate(group, m) }}x</span>
            </template>
            <span v-else class="font-bold text-gray-700 dark:text-gray-300">{{ mediaRate(group, m) }}x</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { platformBadgeLightClass, platformLabel } from '@/utils/platformColors'
import { BILLING_MODE_IMAGE } from '@/constants/channel'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import PlazaModelName from './PlazaModelName.vue'
import {
  contextTierLabel,
  flatRequestPrice,
  formatTierSpan,
  imageTierPrices,
  requestIntervals,
  type PlazaPriceKind,
  type PlazaTierPrice
} from './plazaPriceKind'
import { formatPrice, hasCustomRate, mediaRate, usesIndependentMediaRate, type PlazaPriceMode } from './plazaRates'

const props = defineProps<{
  /** 同一定价方式的非 token 模型。 */
  models: PlazaModel[]
  kind: Exclude<PlazaPriceKind, 'token'>
  group: ModelPlazaGroup
  priceMode: PlazaPriceMode
}>()

const { t } = useI18n()

/** 官方没有按张 / 按次参考价：官方价格口径下价格列为空，也不展示倍率。 */
const isOfficial = computed(() => props.priceMode === 'official')
const showRate = computed(() => !isOfficial.value)
const showReference = computed(() => props.models.some((m) => m.image?.reference_image_price != null))

const sortedModels = computed(() => [...props.models].sort((a, b) => b.name.localeCompare(a.name)))

const tierPrices = computed(() => new Map(props.models.map((m) => [m, imageTierPrices(m)])))

function tierSpan(tier: PlazaTierPrice): string {
  return formatTierSpan(tier, t('modelPlaza.table.pixelUnit'))
}

/** 档位列以档位名区分（像素档未起名时以覆盖范围区分）。 */
function tierKey(tier: PlazaTierPrice): string {
  return tier.label || tierSpan(tier)
}

function tierOf(m: PlazaModel, key: string): PlazaTierPrice | undefined {
  return tierPrices.value.get(m)?.find((tier) => tierKey(tier) === key)
}

/**
 * 档位列：各行档位按出现顺序取并集（档位本身按从小到大排列）；
 * 各行覆盖范围一致时写进表头，否则写在单元格里。
 */
const tierColumns = computed(() => {
  const keys = [...new Set(props.models.flatMap((m) => (tierPrices.value.get(m) ?? []).map(tierKey)))]
  return keys.map((key) => {
    const tiers = props.models.flatMap((m) => tierOf(m, key) ?? [])
    const spans = new Set(tiers.map(tierSpan))
    return { key, label: tiers[0].label, span: spans.size === 1 ? [...spans][0] : '' }
  })
})

/** 实付单价 = 单价 × 该行生效倍率（不换算每百万）。 */
function paid(m: PlazaModel, value: number | null | undefined): string {
  if (isOfficial.value || value == null) return '-'
  return formatPrice(value * mediaRate(props.group, m))
}

/** 按图片计费为 “/ 张”，其余（按次、按视频）为 “/ 次”。 */
function unit(m: PlazaModel): string {
  if (isOfficial.value) return ''
  return m.pricing?.billing_mode === BILLING_MODE_IMAGE
    ? t('modelPlaza.table.perUnitImage')
    : t('modelPlaza.table.perUnitRequest')
}
</script>

<style scoped>
.plaza-price {
  @apply font-mono text-[15px] font-semibold text-primary-700 dark:text-primary-300;
}

.plaza-unit {
  @apply ml-1 text-xs text-gray-400 dark:text-dark-500;
}

.plaza-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  @apply rounded-md bg-gray-100/80 px-2 py-0.5 text-xs dark:bg-dark-700/60;
}
</style>
