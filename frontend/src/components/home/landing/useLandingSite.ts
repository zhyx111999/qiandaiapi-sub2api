import { computed } from 'vue'
import { useAppStore, useAuthStore } from '@/stores'

/** Auth state and the console entry used by the home page. */
export function useLandingSite() {
  const authStore = useAuthStore()
  const appStore = useAppStore()

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  /** The dashboard for signed-in users, the login page otherwise. */
  const consolePath = computed(() => {
    if (!isAuthenticated.value) return '/login'
    return authStore.isAdmin ? '/admin/dashboard' : '/dashboard'
  })

  /** Refresh auth and public settings when the home page mounts. */
  function refreshSiteState() {
    authStore.checkAuth()
    // Uses the injected config cache when it is already loaded.
    if (!appStore.publicSettingsLoaded) {
      appStore.fetchPublicSettings()
    }
  }

  return { isAuthenticated, consolePath, refreshSiteState }
}
