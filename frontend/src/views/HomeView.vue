<template>
  <CustomHomeContent v-if="hasHomeContent" :content="homeContent" />
  <CompactHome v-else-if="compactHomeEnabled" />
  <CosmosHome v-else />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CompactHome from '@/components/home/CompactHome.vue'
import CosmosHome from '@/components/home/cosmos/CosmosHome.vue'
import CustomHomeContent from '@/components/home/CustomHomeContent.vue'
import { useHomeSite } from '@/components/home/useHomeSite'

/** Picks the home page variant: admin custom content, then compact mode, then the cosmos landing page. */
const { homeContent, compactHomeEnabled, refreshSiteState } = useHomeSite()
const hasHomeContent = computed(() => homeContent.value.trim().length > 0)

onMounted(refreshSiteState)
</script>
