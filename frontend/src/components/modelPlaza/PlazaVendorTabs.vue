<template>
  <nav class="plaza-vendors card" :aria-label="t('modelPlaza.filters.vendorLabel')">
    <button
      v-for="id in ['all', ...vendors]"
      :key="id"
      type="button"
      class="plaza-vendor"
      :aria-pressed="modelValue === id"
      :disabled="id !== 'all' && !enabled(id)"
      :data-vendor="id"
      @click="$emit('update:modelValue', id)"
    >
      <span
        v-if="id !== 'all' && plazaVendor(id).icon"
        class="inline-flex"
        :style="plazaVendor(id).color ? { color: plazaVendor(id).color } : undefined"
      >
        <PlatformIcon :platform="plazaVendor(id).icon as GroupPlatform" size="md" />
      </span>
      {{ vendorLabel(id) }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import { platformLabel } from '@/utils/platformColors'
import type { GroupPlatform } from '@/types'
import { isKnownVendor, plazaVendor } from './plazaVendors'

defineProps<{
  /** 数据中出现的厂商（按出现顺序）。 */
  vendors: string[]
  modelValue: string
  /** 当前分组 / 倍率 / 搜索下仍有模型的厂商；其余置灰。 */
  enabled: (id: string) => boolean
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()

function vendorLabel(id: string): string {
  if (id === 'all') return t('modelPlaza.filters.all')
  return isKnownVendor(id) ? t(`modelPlaza.vendors.${id}`) : platformLabel(id)
}
</script>

<style scoped>
.plaza-vendors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
}

.plaza-vendor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  @apply text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-white/5 dark:hover:text-white;
}

.plaza-vendor[aria-pressed='true'] {
  @apply border-primary-300 bg-primary-50/80 text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7);
}

.plaza-vendor:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
