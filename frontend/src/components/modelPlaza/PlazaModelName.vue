<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="min-w-0 font-semibold text-gray-900 [overflow-wrap:anywhere] dark:text-white">{{ name }}</span>
    <button
      type="button"
      class="plaza-copy shrink-0"
      :class="{ 'plaza-copy-done': copied }"
      :title="copied ? t('modelPlaza.table.copied') : t('modelPlaza.table.copyModel', { model: name })"
      :aria-label="copied ? t('modelPlaza.table.copied') : t('modelPlaza.table.copyModel', { model: name })"
      @click="copy"
    >
      <Icon :name="copied ? 'check' : 'copy'" size="xs" class="h-3.5 w-3.5" />
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ name: string }>()

const { t } = useI18n()
const { copyToClipboard } = useClipboard()
const copied = ref(false)

async function copy() {
  if (!(await copyToClipboard(props.name, t('modelPlaza.table.copiedModel', { model: props.name })))) return
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<style scoped>
.plaza-copy {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  @apply text-gray-400 transition-colors hover:bg-white/70 hover:text-primary-600 dark:text-dark-500 dark:hover:bg-white/5 dark:hover:text-primary-300;
}

.plaza-copy-done {
  @apply text-primary-600 dark:text-primary-300;
}
</style>
