<template>
  <CustomHomeContent v-if="hasHomeContent" :content="homeContent" />
  <CompactHome v-else-if="compactHomeEnabled" />
  <LandingHome v-else />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CompactHome from '@/components/home/CompactHome.vue'
import LandingHome from '@/components/home/landing/LandingHome.vue'
import CustomHomeContent from '@/components/home/CustomHomeContent.vue'
import { useHomeSite } from '@/components/home/useHomeSite'

/** Picks the home page variant: admin custom content, then compact mode, then the landing page. */
const { homeContent, compactHomeEnabled, refreshSiteState } = useHomeSite()
const hasHomeContent = computed(() => homeContent.value.trim().length > 0)

onMounted(refreshSiteState)
</script>
