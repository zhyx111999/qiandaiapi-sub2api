<template>
  <div ref="shellRef" class="relative min-h-screen">
    <AppBackdrop />

    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main Content Area -->
    <div
      class="relative min-h-screen transition-all duration-300"
      :class="[sidebarCollapsed ? 'lg:ml-[88px]' : 'lg:ml-[272px]']"
    >
      <!-- Header -->
      <AppHeader />

      <!-- Main Content -->
      <main class="p-4 md:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/styles/onboarding.css'
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingTour } from '@/composables/useOnboardingTour'
import { useOnboardingStore } from '@/stores/onboarding'
import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useGlassSurfaces } from '@/components/common/liquidGlass/useGlassSurfaces'
import AppBackdrop from './AppBackdrop.vue'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'

const appStore = useAppStore()
const shellRef = ref<HTMLElement | null>(null)
useGlassSurfaces(shellRef)
const authStore = useAuthStore()
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const isAdmin = computed(() => authStore.user?.role === 'admin')

const { replayTour, startTour, hasSeen } = useOnboardingTour({
  storageKey: isAdmin.value ? 'admin_guide' : 'user_guide',
  autoStart: false
})

const onboardingStore = useOnboardingStore()
const complianceStore = useAdminComplianceStore()
const mounted = ref(false)
// The tour must not cover the original operator acknowledgement dialog.
const canAutoStartTour = computed(() => mounted.value && isAdmin.value && !authStore.isSimpleMode &&
  complianceStore.initialized && !complianceStore.shouldShow)
watch(canAutoStartTour, (ready) => {
  if (ready && !hasSeen() && !onboardingStore.isDriverActive()) void startTour()
})

onMounted(() => {
  onboardingStore.setReplayCallback(replayTour)
  mounted.value = true
})

defineExpose({ replayTour })
</script>
