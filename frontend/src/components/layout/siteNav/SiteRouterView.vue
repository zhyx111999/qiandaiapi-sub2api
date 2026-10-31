<template>
  <RouterView v-slot="{ Component }">
    <Transition :css="entering" name="site-enter" @leave="leaveAtOnce">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { siteSection } from './siteSection'

/**
 * The app's routed page (App.vue mounts it where the plain RouterView was, before the site nav).
 * Switching sections (首页 / 平台 / 模型广场) fades the incoming page in under the nav, which stays
 * where it is; any other route change shows the page at once. Only site pages animate: the roots
 * marked `site-page` (the console layout, the cover, the public model plaza) carry the animation of
 * `.site-page.site-enter-enter-active` (style.css), so a section change that lands on the sign-in
 * page shows it plainly. Transition reads the duration from that CSS and ends on animationend.
 */
const router = useRouter()
const entering = ref(false)
const stopWatching = router.afterEach((to, from, failure) => {
  if (failure) return
  // The first navigation (a page load) has nothing to switch from.
  entering.value = from.matched.length > 0 && siteSection(to.path) !== siteSection(from.path)
})
onBeforeUnmount(stopWatching)

/** The outgoing page goes at once, so the incoming one never stacks below it for a frame. */
const leaveAtOnce = (_el: Element, done: () => void) => done()
</script>
