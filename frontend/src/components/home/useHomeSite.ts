import { computed, ref } from 'vue'
import { useAuthStore, useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'
import { FeatureFlags, isFeatureFlagEnabled } from '@/utils/featureFlags'

/** Site settings, auth-derived links and theme state shared by every home page variant. */
export function useHomeSite() {
  const authStore = useAuthStore()
  const appStore = useAppStore()

  // Site settings - directly from appStore (already initialized from injected config)
  const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API')
  const siteLogo = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
  const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform')
  const docUrl = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.doc_url || appStore.docUrl || ''))
  const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
  const compactHomeEnabled = computed(() => appStore.cachedPublicSettings?.compact_home_enabled === true)

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const dashboardPath = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))
  /** Console entry: the dashboard for signed-in users, the login page otherwise. */
  const consolePath = computed(() => (isAuthenticated.value ? dashboardPath.value : '/login'))

  const modelPlazaRequiresAuth = computed(() => appStore.cachedPublicSettings?.model_plaza_require_auth === true)
  const showModelPlazaEntry = computed(
    () => isFeatureFlagEnabled(FeatureFlags.modelPlaza) && (isAuthenticated.value || !modelPlazaRequiresAuth.value),
  )

  const currentYear = new Date().getFullYear()

  // main.ts applies the saved theme class before mount; this mirrors it for the toggle.
  const isDark = ref(document.documentElement.classList.contains('dark'))
  function toggleTheme() {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark', isDark.value)
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  /** Refresh auth and public settings when the home page mounts. */
  function refreshSiteState() {
    authStore.checkAuth()
    // Uses the injected config cache when it is already loaded.
    if (!appStore.publicSettingsLoaded) {
      appStore.fetchPublicSettings()
    }
  }

  return {
    siteName,
    siteLogo,
    siteSubtitle,
    docUrl,
    homeContent,
    compactHomeEnabled,
    isAuthenticated,
    dashboardPath,
    consolePath,
    showModelPlazaEntry,
    currentYear,
    isDark,
    toggleTheme,
    refreshSiteState,
  }
}
