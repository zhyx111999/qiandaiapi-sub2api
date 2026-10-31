<template>
  <nav
    v-if="visible"
    ref="navRef"
    v-liquid-glass="NAV_GLASS"
    class="site-nav liquid-glass clear-glass"
    :class="{ 'site-nav--cover': section === 'home', 'site-nav--compact': compact }"
    :aria-label="t('landingHome.nav.label')"
    v-on="capsule.on"
  >
    <GlassCapsule :capsule="capsule" />
    <RouterLink v-for="item in items" :key="item.key" v-slot="{ href, navigate }" :to="item.to" custom>
      <a
        :ref="linkRefs.ref(item.key)"
        :href="href"
        :data-capsule="capsule.state.at === item.key ? '' : undefined"
        class="site-nav__link"
        :aria-current="item.key === section ? 'page' : undefined"
        :title="item.label"
        @click="navigate"
      >
        <svg class="site-nav__icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
        <span class="site-nav__label">{{ item.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { vLiquidGlass } from '@/components/common/liquidGlass'
import { useLandingSite } from '@/components/home/landing/useLandingSite'
import { FeatureFlags, isFeatureFlagEnabled } from '@/utils/featureFlags'
import { followPointerLight } from '../consoleLight'
import { DESKTOP_MIN_WIDTH } from '../consoleGlass'
import GlassCapsule from '../glassCapsule/GlassCapsule.vue'
import { useGlassCapsule, useItemRefs } from '../glassCapsule/useGlassCapsule'
import { consoleLayouts } from './consolePresence'
import { needsCompact, siteNavVisible, siteSection } from './siteSection'
import { siteNavLayout } from './siteNavLayout'

/**
 * The site nav: 首页 / 平台 / 模型广场 in one glass pill that stays where it is (top centre on
 * desktop, bottom centre on phones) across the cover, the console and the model plaza. App.vue
 * mounts it outside the routed views, so switching sections never rebuilds it: its selection
 * capsule glides to the pressed item and the new page fades in underneath.
 *
 * On narrow desktops, where the full labels would reach the console toolbar (whose left edge the
 * top bar publishes), it shows icons; it publishes its own half width for the top bar's title.
 * Icons: Tabler Icons (MIT), as the leaf mark.
 */
const NAV_GLASS = { scale: 26, aberration: 2 } as const
const ICONS = {
  home: 'M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6',
  platform:
    'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1',
  plaza:
    'M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6',
} as const
const ENTER_MS = 340 // the incoming page's fade-in (style.css, html.site-entering)

const route = useRoute()
const { t } = useI18n()
const { isAuthenticated, consolePath } = useLandingSite()
const navRef = ref<HTMLElement | null>(null)
const compact = ref(false)

const section = computed(() => siteSection(route.path))
const visible = computed(() => siteNavVisible(route.path, consoleLayouts.value > 0))
const items = computed(() => [
  { key: 'home' as const, to: '/home', label: t('landingHome.nav.home'), icon: ICONS.home },
  { key: 'platform' as const, to: consolePath.value, label: t('landingHome.nav.platform'), icon: ICONS.platform },
  ...(isFeatureFlagEnabled(FeatureFlags.modelPlaza)
    ? [
        {
          key: 'plaza' as const,
          // Signed in it opens inside the console (sidebar kept); visitors get the public page.
          to: isAuthenticated.value ? { path: '/model-plaza', query: { embedded: '1' } } : '/model-plaza',
          label: t('nav.modelPlaza'),
          icon: ICONS.plaza,
        },
      ]
    : []),
])

/** The capsule rests on the current section's link and goes to a pressed one. */
const linkRefs = useItemRefs()
const capsule = useGlassCapsule({
  container: navRef,
  pressable: linkRefs.keys,
  element: linkRefs.get,
  rest: () => section.value,
  memoryKey: 'site',
})

/** Full labels unless they would reach the console toolbar; publishes the half width for the title. */
async function layout() {
  const desktop = window.innerWidth >= DESKTOP_MIN_WIDTH
  if (!navRef.value || !desktop) {
    compact.value = false
    siteNavLayout.navHalf = 0
    return
  }
  compact.value = false
  await nextTick()
  if (!navRef.value) return
  const toolbarLeft = consoleLayouts.value > 0 ? siteNavLayout.toolbarLeft : null
  compact.value = needsCompact(window.innerWidth, navRef.value.offsetWidth, toolbarLeft)
  await nextTick()
  siteNavLayout.navHalf = (navRef.value?.offsetWidth ?? 0) / 2
}

watch(
  visible,
  (on) => {
    document.documentElement.classList.toggle('has-site-nav', on)
    nextTick(layout)
  },
  { immediate: true }
)
watch([() => siteNavLayout.toolbarLeft, consoleLayouts, items], () => nextTick(layout))

// Switching sections: the incoming page fades in under the nav, which stays put. Checked after the
// render, once the new page (and its console presence) is in place.
let entering = 0
watch(
  section,
  (now, before) => {
    if (!before || now === before || !visible.value) return
    document.documentElement.classList.add('site-entering')
    window.clearTimeout(entering)
    entering = window.setTimeout(() => document.documentElement.classList.remove('site-entering'), ENTER_MS)
  },
  { flush: 'post' }
)

let stopLight: (() => void) | null = null
const onResize = () => void layout()
onMounted(() => {
  window.addEventListener('resize', onResize)
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) stopLight = followPointerLight()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.clearTimeout(entering)
  stopLight?.()
  siteNavLayout.navHalf = 0
  document.documentElement.classList.remove('has-site-nav', 'site-entering')
})
</script>

<style scoped>
.site-nav__link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 999px;
  font: 600 13.5px/1 'Manrope Variable', 'Manrope', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui,
    sans-serif;
  white-space: nowrap;
  color: rgb(31 29 26 / 0.7);
  transition:
    color 0.25s,
    background 0.25s;
}

.site-nav__link:hover,
.site-nav__link[aria-current='page'] {
  color: rgb(31 29 26);
}

/* Hover never moves the capsule; a link without it gets a light wash, as the sidebar links do. */
.site-nav__link:not([data-capsule]):hover {
  background: rgb(255 255 255 / 0.4);
}

/* The current section keeps the cover's green dot next to its label. */
.site-nav__link[aria-current='page']::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgb(59 146 113);
}

.site-nav__icon {
  display: none;
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Narrow desktops: icons only, so the nav keeps clear of the console toolbar. */
.site-nav--compact .site-nav__link {
  padding: 9px 13px;
}

.site-nav--compact .site-nav__link::before,
.site-nav--compact .site-nav__label {
  display: none;
}

.site-nav--compact .site-nav__icon {
  display: block;
}

/* In the dark console (the cover keeps its ivory palette). */
:global(.dark) .site-nav:not(.site-nav--cover) .site-nav__link {
  color: rgb(255 255 255 / 0.7);
}

:global(.dark) .site-nav:not(.site-nav--cover) .site-nav__link:hover,
:global(.dark) .site-nav:not(.site-nav--cover) .site-nav__link[aria-current='page'] {
  color: rgb(255 255 255);
}

:global(.dark) .site-nav:not(.site-nav--cover) .site-nav__link:not([data-capsule]):hover {
  background: rgb(255 255 255 / 0.06);
}
</style>
