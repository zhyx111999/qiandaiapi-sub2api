<template>
  <section class="border-t border-gray-100 dark:border-dark-700/60" data-testid="novelai-addon-pricing">
    <header class="px-5 pb-2 pt-4">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t('modelPlaza.novelaiAddons.title') }}</h3>
      <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">{{ t('modelPlaza.novelaiAddons.description') }}</p>
    </header>
    <div class="plaza-table max-w-full overflow-x-auto">
      <table class="w-full min-w-[640px] table-fixed border-collapse text-sm tabular-nums">
        <colgroup>
          <col class="w-44 xl:w-60 2xl:w-[280px]" />
          <col class="w-[30%]" />
          <col />
        </colgroup>
        <thead>
          <tr class="text-left text-xs font-semibold text-gray-500 dark:text-dark-400">
            <th scope="col" class="py-2.5 pl-5 pr-4">{{ t('modelPlaza.novelaiAddons.feature') }}</th>
            <th scope="col" class="px-3 py-2.5">{{ t('modelPlaza.novelaiAddons.price') }}</th>
            <th scope="col" class="py-2.5 pl-3 pr-5">{{ t('modelPlaza.novelaiAddons.notes') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="addon in ADDONS" :key="addon.id" :data-addon="addon.id" class="border-t border-gray-100 dark:border-dark-800">
            <th scope="row" class="py-3 pl-5 pr-4 text-left align-top font-semibold text-gray-900 dark:text-white">
              {{ t(addon.nameKey) }}
            </th>
            <td class="px-3 py-3 align-top">
              <template v-if="'price' in addon">
                <span class="plaza-price whitespace-nowrap">{{ formatPrice(addon.price) }}</span>
                <span class="ml-1 text-xs text-gray-400 dark:text-dark-500">{{ t(addon.unitKey) }}</span>
              </template>
              <span v-else class="plaza-price">{{ t(addon.priceKey, { price: formatPrice(USD_PER_ANLAS) }) }}</span>
            </td>
            <td class="py-3 pl-3 pr-5 align-top text-xs leading-5 text-gray-500 dark:text-dark-400">{{ t(addon.noteKey) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="px-5 pb-4 pt-2 text-xs leading-5 text-gray-500 dark:text-dark-400" data-testid="novelai-director-examples">
      {{ t('modelPlaza.novelaiAddons.directorExamples', {
        backgroundSmall: formatPrice(20 * USD_PER_ANLAS),
        backgroundLarge: formatPrice(65 * USD_PER_ANLAS),
        otherLarge: formatPrice(30 * USD_PER_ANLAS)
      }) }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatPlazaPrice, type PlazaPriceDisplay } from '@/utils/plazaCurrency'

const props = defineProps<{ priceDisplay?: PlazaPriceDisplay }>()
const { t } = useI18n()
const formatPrice = (value: number) => formatPlazaPrice(value, 1, 'credit', props.priceDisplay)

// Static add-on prices, separate from the generation pixel tiers and reference-image prices.
// Director uses the calibrated Opus Anlas charge; a zero-Anlas tier stays free.
const USD_PER_ANLAS = 0.01
const ADDONS = [
  {
    id: 'upscale',
    nameKey: 'modelPlaza.novelaiAddons.upscale',
    price: 0.01,
    unitKey: 'modelPlaza.table.perUnitRequest',
    noteKey: 'modelPlaza.novelaiAddons.upscaleNote'
  },
  {
    id: 'director',
    nameKey: 'modelPlaza.novelaiAddons.director',
    priceKey: 'modelPlaza.novelaiAddons.directorPrice',
    noteKey: 'modelPlaza.novelaiAddons.directorNote'
  },
  {
    id: 'encode-vibe',
    nameKey: 'modelPlaza.novelaiAddons.encodeVibe',
    price: 0.02,
    unitKey: 'modelPlaza.table.perUnitImage',
    noteKey: 'modelPlaza.novelaiAddons.encodeVibeNote'
  },
  {
    id: 'suggest-tags',
    nameKey: 'modelPlaza.novelaiAddons.suggestTags',
    priceKey: 'modelPlaza.novelaiAddons.free',
    noteKey: 'modelPlaza.novelaiAddons.suggestTagsNote'
  }
] as const
</script>

<style scoped>
.plaza-price {
  @apply font-mono text-[15px] font-semibold text-primary-700 dark:text-primary-300;
}
</style>
