<template>
  <div class="mt-4 border-t border-dashed border-gray-200 pt-4 dark:border-dark-700" data-testid="image-reference-pricing">
    <label class="block font-medium text-gray-700 dark:text-gray-300">
      {{ t('admin.groups.imagePricing.referenceTitle') }}
    </label>
    <p class="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
      {{ t('admin.groups.imagePricing.referenceHint') }}
    </p>
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label class="input-label">{{ t('admin.groups.imagePricing.referencePrice') }}</label>
        <input
          type="number"
          class="input"
          min="0"
          step="0.001"
          data-testid="image-reference-price"
          :value="price ?? ''"
          :placeholder="t('admin.groups.imagePricing.referenceModelDefault')"
          @input="emit('update:price', inputValue($event))"
        />
      </div>
      <div v-for="family in families" :key="family.key">
        <label class="input-label">{{ family.label }} ($)</label>
        <input
          type="number"
          class="input"
          min="0"
          step="0.001"
          :data-testid="`image-reference-price-${family.key}`"
          :value="modelPrices[family.key] ?? ''"
          :placeholder="String(referenceUnitPrice(null, price, family.defaultPrice))"
          @input="setFamilyPrice(family.key, $event)"
        />
      </div>
    </div>
    <p class="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300" data-testid="image-reference-preview">
      {{ t('admin.groups.imagePricing.referencePreview', { multiplier }) }}
      <span v-for="item in preview" :key="item.label" class="ml-2 whitespace-nowrap">{{ item.label }} {{ item.value }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  referenceFamiliesForPlatform,
  referenceUnitPrice,
  type ImageReferenceModelPricesForm,
} from './groupsImageReferencePricing'

const props = defineProps<{
  price: number | string | null
  modelPrices: ImageReferenceModelPricesForm
  platform: string
  multiplier: number
}>()
const emit = defineEmits<{
  'update:price': [value: number | string | null]
  'update:modelPrices': [value: ImageReferenceModelPricesForm]
}>()
const { t } = useI18n()

const families = computed(() => referenceFamiliesForPlatform(props.platform))

const format = (unit: number) => `$${(unit * props.multiplier).toFixed(6).replace(/\.?0+$/, '') || '0'}`
const preview = computed(() => [
  ...families.value.map(family => ({
    label: family.label,
    value: format(referenceUnitPrice(props.modelPrices[family.key], props.price, family.defaultPrice)),
  })),
  { label: t('admin.groups.imagePricing.referenceOtherModels'), value: format(referenceUnitPrice(null, props.price, 0)) },
])

// Keep intermediate decimal input such as "0." intact until serialization.
const inputValue = (event: Event) => {
  const raw = (event.target as HTMLInputElement).value
  return raw === '' ? null : raw
}
function setFamilyPrice(key: string, event: Event) {
  const next = { ...props.modelPrices }
  const value = inputValue(event)
  if (value === null) delete next[key]
  else next[key] = value
  emit('update:modelPrices', next)
}
</script>
