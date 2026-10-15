<template>
  <div class="min-h-screen">
    <iframe v-if="isUrl" :src="trimmed" class="h-screen w-full border-0" allowfullscreen></iframe>
    <!-- SECURITY: home_content is an admin-only setting, XSS risk is acceptable -->
    <div v-else v-html="content"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** Admin-provided home page: a URL renders in an iframe, anything else as HTML. */
const props = defineProps<{ content: string }>()

const trimmed = computed(() => props.content.trim())
const isUrl = computed(() => trimmed.value.startsWith('http://') || trimmed.value.startsWith('https://'))
</script>
