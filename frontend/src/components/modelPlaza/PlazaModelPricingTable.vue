<template>
  <div class="plaza-table max-w-full overflow-x-auto">
    <table class="w-full min-w-[760px] table-fixed border-collapse text-sm tabular-nums">
      <!-- Bound the name/rate columns; share the remaining width between prices. -->
      <colgroup>
        <col class="w-60 xl:w-72 2xl:w-80" />
        <col />
        <col />
        <col />
        <col v-if="showRate" class="w-24" />
      </colgroup>
      <thead>
        <tr class="text-left text-xs font-semibold text-gray-500 dark:text-dark-400">
          <th class="py-2.5 pl-5 pr-4">
            {{ t('modelPlaza.table.model') }}
            <span class="ml-1 font-normal text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.unitPerMillion') }}</span>
          </th>
          <th class="px-3 py-2.5">{{ t('modelPlaza.table.input') }}</th>
          <th class="px-3 py-2.5">{{ t('modelPlaza.table.output') }}</th>
          <th class="px-3 py-2.5">{{ t('modelPlaza.table.cache') }}</th>
          <th v-if="showRate" class="py-2.5 pl-3 pr-5 text-right">{{ t('modelPlaza.table.rate') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="{ model: m, period, key } in rows"
          :key="key"
          class="border-t border-gray-100 transition-colors hover:bg-white/50 dark:border-dark-800 dark:hover:bg-white/[0.03]"
        >
          <!-- 模型名 + 复制；分时时段行标注时段 -->
          <td class="py-3 pl-5 pr-4 align-middle">
            <PlazaModelName :name="m.name">
              <span
                v-if="period"
                class="plaza-badge font-mono"
                :title="timePricingRowHint(m)"
              >
                <span v-if="m.time_pricing?.weekdays_only" class="mr-1 font-sans">{{ t('modelPlaza.table.timePricingWeekdays') }}</span>
                {{ formatTimeWindow(period) }}
              </span>
              <span
                v-if="group.platform && m.platform !== group.platform"
                :class="['rounded-md px-1.5 py-0.5 text-[10px] font-medium', platformBadgeLightClass(m.platform)]"
              >
                {{ platformLabel(m.platform) }}
              </span>
              <span v-if="m.image" class="plaza-badge">{{ t('modelPlaza.table.imageModel') }}</span>
              <span v-if="m.long_context_basis === 'marginal'" class="plaza-badge" :title="t('modelPlaza.table.tierHintMarginal')">
                {{ t('modelPlaza.table.marginalBadge') }}
              </span>
              <span
                v-for="[effort, multiplier] in reasoningEffortMultipliers(m)"
                :key="effort"
                class="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                :title="t('modelPlaza.table.reasoningMultiplierHint', { effort, multiplier })"
                :data-reasoning-effort="effort"
              >
                {{ t('modelPlaza.table.reasoningMultiplierBadge', { effort, multiplier }) }}
              </span>
            </PlazaModelName>
          </td>

          <!-- 输入 / 输出：有阶梯时每档一行（档位标签只放输入列）；分组价格下方划线展示官方价 -->
          <td v-for="field in TOKEN_FIELDS" :key="field" class="px-3 py-3 align-middle">
            <template v-if="tiers(m).length">
              <div v-for="(iv, idx) in tiers(m)" :key="idx" class="text-xs leading-5" :title="tierHint(m)">
                <span v-if="field === 'input_price'" class="mr-1 text-gray-400 dark:text-dark-500">{{ contextTierLabel(iv) }}</span>
                <span class="plaza-price">{{ price(iv[field], period) }}</span>
              </div>
            </template>
            <template v-else>
              <div class="plaza-price plaza-price-main">{{ price(source(m)?.[field], period) }}</div>
              <div v-if="showOfficialBelow(m, field, period)" class="plaza-official">
                {{ t('modelPlaza.table.officialPrice') }} {{ formatPrice(m.official_pricing?.[field], PER_MILLION) }}
              </div>
            </template>
          </td>

          <!-- 缓存：写入（含 1h / 12h）/ 读取；有阶梯且带缓存价时每档一行 -->
          <td class="px-3 py-3 align-middle text-xs leading-5">
            <template v-if="hasTierCache(tiers(m))">
              <div v-for="(iv, idx) in tiers(m)" :key="idx" class="break-words" :title="tierHint(m)">
                <template v-if="hasCache(iv)">
                  <span class="text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.cacheWriteShort') }}</span>
                  <span class="plaza-price"> {{ price(iv.cache_write_price, period) }}</span>
                  <span v-if="iv.cache_write_1h_price != null" class="text-gray-400 dark:text-dark-500">
                    (1h <span class="plaza-price">{{ price(iv.cache_write_1h_price, period) }}</span>)</span>
                  <span v-if="iv.cache_write_12h_price != null" class="text-gray-400 dark:text-dark-500">
                    (12h <span class="plaza-price">{{ price(iv.cache_write_12h_price, period) }}</span>)</span>
                  <span class="ml-1 text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.cacheReadShort') }}</span>
                  <span class="plaza-price"> {{ price(iv.cache_read_price, period) }}</span>
                </template>
                <span v-else class="text-gray-400 dark:text-dark-500">-</span>
              </div>
            </template>
            <template v-else-if="source(m) && hasCache(source(m)!)">
              <div class="break-words">
                <span class="mr-1 text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.cacheWrite') }}</span>
                <span class="plaza-price">{{ price(source(m)!.cache_write_price, period) }}</span>
                <span v-if="source(m)!.cache_write_1h_price != null" class="text-gray-400 dark:text-dark-500">
                  (1h <span class="plaza-price">{{ price(source(m)!.cache_write_1h_price, period) }}</span>)</span>
                <span v-if="source(m)!.cache_write_12h_price != null" class="text-gray-400 dark:text-dark-500">
                  (12h <span class="plaza-price">{{ price(source(m)!.cache_write_12h_price, period) }}</span>)</span>
              </div>
              <div class="break-words">
                <span class="mr-1 text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.cacheRead') }}</span>
                <span class="plaza-price">{{ price(source(m)!.cache_read_price, period) }}</span>
              </div>
            </template>
            <span v-else class="text-gray-400 dark:text-dark-500">-</span>
          </td>

          <!-- 倍率：时段行为 生效倍率×时段倍率；专属倍率划线展示原倍率 -->
          <td v-if="showRate" class="py-3 pl-3 pr-5 text-right align-middle font-mono text-xs">
            <span
              v-if="period"
              class="font-bold text-primary-600 dark:text-primary-400"
              :title="t('modelPlaza.table.timePricingRateHint', { rate: rate, multiplier: period.multiplier })"
            >{{ multiplyRate(rate, period.multiplier) }}x</span>
            <template v-else-if="hasCustomRate(group)">
              <span class="mr-1 text-gray-400 line-through dark:text-dark-500">{{ group.rate_multiplier }}x</span>
              <span class="font-bold text-primary-600 dark:text-primary-400">{{ rate }}x</span>
            </template>
            <span v-else class="font-bold text-gray-700 dark:text-gray-300">{{ rate }}x</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveIntervalPrices } from '@/utils/pricing'
import { platformBadgeLightClass, platformLabel } from '@/utils/platformColors'
import { REASONING_EFFORT_LEVELS } from '@/constants/channel'
import type { ModelPlazaGroup, PlazaModel, PlazaTimePricingPeriod } from '@/api/modelPlaza'
import type { UserPricingInterval } from '@/api/channels'
import PlazaModelName from './PlazaModelName.vue'
import { contextTierLabel } from './plazaPriceKind'
import {
  PER_MILLION,
  effectiveRate,
  formatPrice,
  hasCustomRate,
  multiplyRate,
  type PlazaPriceMode
} from './plazaRates'

const props = defineProps<{
  /** 按 token 计费的模型。 */
  models: PlazaModel[]
  group: ModelPlazaGroup
  priceMode: PlazaPriceMode
  /**
   * 高峰窗口描述(含倍率与服务器时区标注),空串/缺省 = 分组未启用高峰。
   * 表格价格均不含高峰因子,该窗口仅用于分时时段行的 tooltip 披露。
   */
  peakWindow?: string
}>()

const { t } = useI18n()

const TOKEN_FIELDS = ['input_price', 'output_price'] as const
type TokenField = (typeof TOKEN_FIELDS)[number]
type CachePrices = Pick<UserPricingInterval, 'cache_write_price' | 'cache_write_1h_price' | 'cache_write_12h_price' | 'cache_read_price'>

const isOfficial = computed(() => props.priceMode === 'official')
const showRate = computed(() => !isOfficial.value)
const rate = computed(() => effectiveRate(props.group))

/** 按官方输出价从高到低，无官方价的排最后；同价按名称降序（新版本号在前）。 */
const sortedModels = computed(() =>
  [...props.models].sort((a, b) => {
    const pa = a.official_pricing?.output_price ?? null
    const pb = b.official_pricing?.output_price ?? null
    if (pa != null && pb != null && pa !== pb) return pb - pa
    if (pa != null && pb == null) return -1
    if (pa == null && pb != null) return 1
    return b.name.localeCompare(a.name)
  })
)

interface PlazaRow {
  model: PlazaModel
  period: PlazaTimePricingPeriod | null
  key: string
}

/** 每个模型一行标准价；分组价格下，配置了分时倍率的模型再按时段各加一行。 */
const rows = computed<PlazaRow[]>(() =>
  sortedModels.value.flatMap((m) => {
    const base: PlazaRow = { model: m, period: null, key: `${m.platform}:${m.name}` }
    if (isOfficial.value) return [base]
    const periods = (m.time_pricing?.periods ?? []).map<PlazaRow>((p, idx) => ({
      model: m,
      period: p,
      key: `${m.platform}:${m.name}:${idx}`
    }))
    return [base, ...periods]
  })
)

/** 当前口径的价格来源：分组价格取实收定价，官方价格取官方参考价。 */
function source(m: PlazaModel) {
  return isOfficial.value ? m.official_pricing : m.pricing
}

/** 当前口径的阶梯（官方阶梯不受分组开关影响）。 */
function tiers(m: PlazaModel): UserPricingInterval[] {
  const intervals = isOfficial.value ? m.official_pricing?.intervals ?? [] : m.pricing?.intervals ?? []
  const sorted = [...intervals].sort((a, b) => a.min_tokens - b.min_tokens)
  return isOfficial.value ? sorted : sorted.map((iv) => resolveIntervalPrices(iv, m.pricing!))
}

/** 每百万 token 价：分组价格乘生效倍率（时段行再乘时段倍率），官方价格不乘。 */
function price(value: number | null | undefined, period: PlazaTimePricingPeriod | null): string {
  if (value == null) return '-'
  if (isOfficial.value) return formatPrice(value, PER_MILLION)
  return formatPrice(value * (period ? multiplyRate(rate.value, period.multiplier) : rate.value), PER_MILLION)
}

/** 分组价格的标准行下方划线展示官方价（Fair 看板口径）。 */
function showOfficialBelow(m: PlazaModel, field: TokenField, period: PlazaTimePricingPeriod | null): boolean {
  return !isOfficial.value && !period && m.official_pricing?.[field] != null
}

function hasCache(p: CachePrices): boolean {
  return p.cache_write_price != null || p.cache_write_1h_price != null || p.cache_write_12h_price != null || p.cache_read_price != null
}

function hasTierCache(intervals: UserPricingInterval[]): boolean {
  return intervals.some(hasCache)
}

function reasoningEffortMultipliers(m: PlazaModel): [string, number][] {
  const multipliers = m.pricing?.reasoning_effort_multipliers
  return REASONING_EFFORT_LEVELS.flatMap((effort) => {
    const multiplier = multipliers?.[effort]
    return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0
      ? [[effort, multiplier] as [string, number]]
      : []
  })
}

/** 档位说明:整单按档计价,或(平台旧规则)仅超出部分按档计价。 */
function tierHint(m: PlazaModel): string {
  return m.long_context_basis === 'marginal' ? t('modelPlaza.table.tierHintMarginal') : t('modelPlaza.table.tierHint')
}

/**
 * 时段行 tooltip:仅工作日生效的配置换用带周末回落说明的文案;
 * 分组启用高峰倍率时追加披露——本行价格不含高峰因子,与高峰窗口重叠的部分实付再乘高峰倍率。
 */
function timePricingRowHint(m: PlazaModel): string {
  const key = m.time_pricing?.weekdays_only
    ? 'modelPlaza.table.timePricingRowHintWeekdays'
    : 'modelPlaza.table.timePricingRowHint'
  let hint = t(key, { timezone: m.time_pricing?.timezone })
  if (props.peakWindow) {
    hint += t('modelPlaza.table.timePricingRowHintPeak', {
      window: props.peakWindow,
      multiplier: props.group.peak_rate_multiplier ?? 1
    })
  }
  return hint
}

/** “00:30–08:30”;整分钟的 HH:mm:ss 省略秒。 */
function formatTimeWindow(p: PlazaTimePricingPeriod): string {
  const clock = (v: string) => v.replace(/^(\d{2}:\d{2}):00$/, '$1')
  return `${clock(p.start_time)}–${clock(p.end_time)}`
}
</script>

<style scoped>
.plaza-price {
  @apply whitespace-nowrap font-mono font-semibold text-gray-900 dark:text-gray-50;
}

.plaza-price-main {
  @apply text-[15px] text-primary-700 dark:text-primary-300;
}

.plaza-official {
  margin-top: 2px;
  @apply text-[11px] text-gray-400 line-through dark:text-dark-500;
}

.plaza-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  @apply rounded-md bg-gray-100/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-dark-700/70 dark:text-dark-300;
}
</style>
