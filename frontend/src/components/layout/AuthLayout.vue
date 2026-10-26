<template>
  <div ref="shellRef" class="relative flex min-h-screen items-center justify-center px-4 py-24">
    <AppBackdrop />

    <RouterLink to="/home" class="btn btn-secondary absolute left-5 top-5 z-10 gap-2">
      <Icon name="arrowLeft" size="sm" />
      {{ t('landingHome.nav.home') }}
    </RouterLink>

    <div class="relative z-10 w-full max-w-md">
      <div class="mb-8 text-center">
        <template v-if="settingsLoaded">
          <RouterLink to="/home" class="mb-4 inline-flex h-16 w-16 overflow-hidden rounded-2xl shadow-glass">
            <img :src="siteLogo || '/logo.svg'" :alt="siteName" class="h-full w-full object-contain" />
          </RouterLink>
          <h1 class="mb-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {{ siteName }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-dark-400">{{ siteSubtitle }}</p>
        </template>
      </div>

      <!-- Login, registration, verification and recovery reuse their original forms and APIs. -->
      <div class="card-glass rounded-3xl p-6 sm:p-8">
        <slot />
      </div>

      <div class="mt-6 text-center text-sm"><slot name="footer" /></div>
      <div class="mt-8 text-center text-xs text-gray-500 dark:text-dark-400">
        &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'
import Icon from '@/components/icons/Icon.vue'
import AppBackdrop from './AppBackdrop.vue'
import { useGlassSurfaces } from '@/components/common/liquidGlass/useGlassSurfaces'

const { t } = useI18n()
const shellRef = ref<HTMLElement | null>(null)
useGlassSurfaces(shellRef)
const appStore = useAppStore()
const siteName = computed(() => appStore.siteName || 'Sub2API')
const siteLogo = computed(() => sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway')
const settingsLoaded = computed(() => appStore.publicSettingsLoaded)
const currentYear = new Date().getFullYear()

onMounted(() => {
  void appStore.fetchPublicSettings()
})
</script>
