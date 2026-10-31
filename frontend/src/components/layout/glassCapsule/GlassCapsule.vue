<template>
  <span
    :ref="capsule.bind"
    class="glass-capsule"
    :class="{ 'glass-capsule-on': capsule.state.shown, 'glass-capsule-hot': capsule.state.hot }"
    :style="{ borderRadius: capsule.radius === 'pill' ? '9999px' : `${capsule.radius}px` }"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import type { CapsuleHandle } from './useGlassCapsule'

/** The capsule element of a useGlassCapsule host, placed as the first child of its container. */
defineProps<{ capsule: CapsuleHandle }>()
</script>
