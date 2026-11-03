<template>
  <template v-if="ready">
    <ChannelStatusV4View v-if="view === 'v4'" />
    <ChannelStatusView v-else />
  </template>
</template>

<script setup lang="ts">
import ChannelStatusView from '@/views/user/ChannelStatusView.vue'
import ChannelStatusV4View from './ChannelStatusV4View.vue'
import { useChannelMonitorView } from './useChannelMonitorView'

// The monitor page: the v4 card page when the site runs v4, otherwise the official page.
// Nothing renders until the site has answered, so the wrong page never flashes.
const { view, ready } = useChannelMonitorView()
</script>
