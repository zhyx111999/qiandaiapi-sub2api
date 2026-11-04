<template>
  <div class="plaza-toolbar">
    <div class="plaza-search">
      <Icon name="search" size="sm" class="plaza-search-icon" />
      <input
        :value="search"
        type="text"
        :placeholder="t('modelPlaza.filters.searchPlaceholder')"
        :aria-label="t('modelPlaza.filters.modelLabel')"
        class="input plaza-search-input"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="search"
        type="button"
        class="plaza-search-clear"
        :aria-label="t('common.clear')"
        @click="$emit('update:search', '')"
      >
        <Icon name="x" size="xs" class="h-3.5 w-3.5" />
      </button>
    </div>
    <Select
      :model-value="groupId"
      :options="groupOptions"
      :aria-label="t('modelPlaza.filters.groupLabel')"
      @update:model-value="$emit('update:groupId', toFilter($event))"
    />
    <Select
      :model-value="rate"
      :options="rateOptions"
      :aria-label="t('modelPlaza.filters.rateLabel')"
      @update:model-value="$emit('update:rate', toFilter($event))"
    />
    <div class="plaza-mode">
      <span class="plaza-mode-hint">{{ t('modelPlaza.priceMode.hint') }}</span>
      <div class="plaza-mode-switch" role="radiogroup" :aria-label="t('modelPlaza.priceMode.label')">
        <button
          v-for="mode in PRICE_MODES"
          :key="mode"
          type="button"
          role="radio"
          :aria-checked="priceMode === mode"
          :data-price-mode="mode"
          @click="$emit('update:priceMode', mode)"
        >
          {{ t(`modelPlaza.priceMode.${mode}`) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import Select, { type SelectOption } from '@/components/common/Select.vue'
import type { PlazaPriceMode } from './plazaRates'

export interface PlazaFilterGroup {
  id: number
  name: string
  rate: number
  /** 组内（搜索后）模型所属厂商。 */
  vendors: Set<string>
}

const PRICE_MODES: PlazaPriceMode[] = ['group', 'official']

const props = defineProps<{
  groups: PlazaFilterGroup[]
  /** 全量生效倍率，去重升序。 */
  rates: number[]
  vendor: string
  groupId: number | 'all'
  rate: number | 'all'
  search: string
  priceMode: PlazaPriceMode
}>()

defineEmits<{
  'update:groupId': [value: number | 'all']
  'update:rate': [value: number | 'all']
  'update:search': [value: string]
  'update:priceMode': [value: PlazaPriceMode]
}>()

const { t } = useI18n()

/**
 * 厂商 / 分组 / 倍率互为约束：某项可选 ⟺ 在其余维度当前选择下仍有分组命中；
 * 「全部」恒可选，用来解除本维约束。
 */
function vendorMatches(g: PlazaFilterGroup): boolean {
  return props.vendor === 'all' || g.vendors.has(props.vendor)
}

const groupOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: t('modelPlaza.filters.groupLabel') },
  ...props.groups.map((g) => ({
    value: g.id,
    label: g.name,
    disabled: !vendorMatches(g) || (props.rate !== 'all' && g.rate !== props.rate)
  }))
])

const rateOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: t('modelPlaza.filters.rateLabel') },
  ...props.rates.map((r) => ({
    value: r,
    label: `${r}x`,
    disabled: !props.groups.some(
      (g) => g.rate === r && vendorMatches(g) && (props.groupId === 'all' || g.id === props.groupId)
    )
  }))
])

function toFilter(value: string | number | boolean | null): number | 'all' {
  return value === 'all' || value === null ? 'all' : Number(value)
}
</script>

<style scoped>
.plaza-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(168px, 220px) minmax(112px, 140px) auto;
  gap: 8px;
  align-items: center;
}

.plaza-search {
  position: relative;
  min-width: 0;
}

.plaza-search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  z-index: 1;
  transform: translateY(-50%);
  pointer-events: none;
  @apply text-gray-400 dark:text-dark-500;
}

.plaza-search-input {
  padding-left: 38px;
  padding-right: 36px;
}

.plaza-search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  transform: translateY(-50%);
  @apply text-gray-400 hover:text-gray-700 dark:text-dark-500 dark:hover:text-white;
}

.plaza-mode {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.plaza-mode-hint {
  font-size: 12px;
  white-space: nowrap;
  @apply text-gray-500 dark:text-dark-400;
}

.plaza-mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 9999px;
  @apply border border-gray-200 bg-gray-100/80 dark:border-dark-600 dark:bg-dark-800;
}

.plaza-mode-switch button {
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  @apply text-gray-600 transition-colors dark:text-dark-300;
}

.plaza-mode-switch button[aria-checked='true'] {
  @apply bg-primary-600 text-white shadow-sm dark:bg-primary-500;
}

@media (max-width: 1279px) {
  .plaza-mode-hint {
    display: none;
  }
}

@media (max-width: 767px) {
  .plaza-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .plaza-search,
  .plaza-mode {
    grid-column: 1 / -1;
  }

  .plaza-mode {
    justify-content: flex-start;
  }
}
</style>
