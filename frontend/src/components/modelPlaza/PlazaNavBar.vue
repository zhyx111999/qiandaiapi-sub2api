<template>
  <header v-liquid-glass="{ scale: 12, aberration: 0 }" class="glass sticky top-3 z-30 mx-3 mt-3 rounded-2xl sm:mx-6">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
      <RouterLink to="/home" class="flex min-w-0 items-center gap-3" :aria-label="t('landingHome.nav.home')">
        <template v-if="settings">
          <span class="flex h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-glass-sm">
            <img :src="siteLogo || '/logo.svg'" alt="" class="h-full w-full object-contain" />
          </span>
          <span class="truncate text-base font-semibold text-gray-950 dark:text-white">{{ siteName }}</span>
        </template>
        <template v-else>
          <span class="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-700" aria-hidden="true"></span>
          <span class="h-5 w-28 animate-pulse rounded bg-gray-200 dark:bg-dark-700" aria-hidden="true"></span>
        </template>
      </RouterLink>

      <div class="flex shrink-0 items-center gap-2">
        <LocaleSwitcher />
        <RouterLink v-if="isAuthenticated" :to="backTarget" class="btn btn-primary btn-sm">
          {{ t('modelPlaza.nav.backToDashboard') }}
        </RouterLink>
        <RouterLink v-else :to="{ path: '/login', query: { redirect: '/model-plaza' } }" class="btn btn-primary btn-sm">
          {{ t('modelPlaza.nav.login') }}
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sanitizeUrl } from '@/utils/url'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const settings = computed(() => appStore.cachedPublicSettings)
const siteName = computed(() => settings.value?.site_name || 'Sub2API')
const siteLogo = computed(() =>
  sanitizeUrl(settings.value?.site_logo || '', { allowRelative: true, allowDataUrl: true })
)
const isAuthenticated = computed(() => authStore.isAuthenticated)
const backTarget = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))
</script>
