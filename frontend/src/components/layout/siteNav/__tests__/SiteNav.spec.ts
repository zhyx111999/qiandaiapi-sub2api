import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const { authStore, appStore, flags } = vi.hoisted(() => ({
  authStore: { isAuthenticated: false, isAdmin: false, checkAuth: vi.fn() },
  appStore: { publicSettingsLoaded: true, fetchPublicSettings: vi.fn() },
  flags: { plaza: true },
}))
vi.mock('@/stores', () => ({ useAuthStore: () => authStore, useAppStore: () => appStore }))
vi.mock('@/utils/featureFlags', () => ({
  FeatureFlags: { modelPlaza: 'modelPlaza' },
  isFeatureFlagEnabled: () => flags.plaza,
}))
vi.mock('vue-i18n', async (original) => ({
  ...(await original<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

import SiteNav from '../SiteNav.vue'
import SiteRouterView from '../SiteRouterView.vue'
import { consoleLayouts, useConsolePresence } from '../consolePresence'

/** A console page: registers itself the way each AppLayout does (through ConsoleBackdrop). */
const consolePage = defineComponent({
  setup() {
    useConsolePresence()
    return () => h('div', { class: 'site-page min-h-screen' }, 'console')
  },
})
/** Another console page, so moving to it re-mounts the routed page. */
const usersPage = defineComponent({
  setup() {
    useConsolePresence()
    return () => h('div', { class: 'site-page min-h-screen' }, 'users')
  },
})
const plainPage = defineComponent({ render: () => h('div', 'page') })
/** As App.vue: the routed page first, the site nav after it. */
const App = defineComponent({ render: () => [h(SiteRouterView), h(SiteNav)] })

async function openAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: plainPage },
      { path: '/login', component: plainPage },
      { path: '/model-plaza', component: consolePage },
      { path: '/dashboard', component: consolePage },
      { path: '/admin/dashboard', component: consolePage },
      { path: '/admin/users', component: usersPage },
    ],
  })
  await router.push(path)
  await router.isReady()
  // Transition runs for real (test-utils stubs it by default): the fade is part of what is tested.
  const wrapper = mount(App, { global: { plugins: [router], stubs: { transition: false } }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

const links = (w: VueWrapper) => w.findAll('a.site-nav__link').map((a) => a.attributes('href'))
const current = (w: VueWrapper) => w.find('a[aria-current="page"]').attributes('href')
const spacer = (w: VueWrapper) => w.find('.site-nav-spacer').exists()
/** Whether the page just routed to is in its enter transition. */
const fadingIn = () => !!document.querySelector('.site-enter-enter-active')

let wrapper: VueWrapper | undefined
beforeEach(() => {
  authStore.isAuthenticated = false
  authStore.isAdmin = false
  flags.plaza = true
  consoleLayouts.value = 0
  // Frames as timers, so the enter transition runs to its end in jsdom.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('site nav', () => {
  it('on the cover: home, platform (sign-in for visitors) and the public model plaza', async () => {
    wrapper = (await openAt('/home')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/login', '/model-plaza'])
    expect(current(wrapper)).toBe('/home')
    expect(wrapper.get('nav').classes()).toContain('site-nav--cover')
    expect(spacer(wrapper)).toBe(true)
  })

  it('in the console: the dashboard as platform and the model plaza inside the console', async () => {
    authStore.isAuthenticated = true
    wrapper = (await openAt('/admin/users')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/dashboard', '/model-plaza?embedded=1'])
    expect(current(wrapper)).toBe('/dashboard')
  })

  it('sends administrators to the admin dashboard, and marks the plaza while on it', async () => {
    authStore.isAuthenticated = true
    authStore.isAdmin = true
    wrapper = (await openAt('/model-plaza')).wrapper
    expect(links(wrapper)[1]).toBe('/admin/dashboard')
    expect(current(wrapper)).toBe('/model-plaza?embedded=1')
  })

  it('leaves the model plaza out when it is switched off', async () => {
    flags.plaza = false
    wrapper = (await openAt('/home')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/login'])
  })

  it('does not show on pages outside the cover, the plaza and the console', async () => {
    wrapper = (await openAt('/login')).wrapper
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(spacer(wrapper)).toBe(false)
  })

  it('goes away when leaving for such a page', async () => {
    const app = await openAt('/home')
    wrapper = app.wrapper
    await app.router.push('/login')
    await flushPromises()
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('is the same element across cover → console → cover, and fades each new page in', async () => {
    authStore.isAuthenticated = true
    const app = await openAt('/home')
    wrapper = app.wrapper
    const nav = wrapper.get('nav').element
    for (const [path, href] of [['/dashboard', '/dashboard'], ['/home', '/home']]) {
      await app.router.push(path)
      await nextTick()
      expect(fadingIn()).toBe(true)
      await flushPromises()
      expect(wrapper.get('nav').element).toBe(nav)
      expect(current(wrapper)).toBe(href)
      // No animation runs in jsdom, so the transition ends at once.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(fadingIn()).toBe(false)
    }
  })

  it('shows a page within the same section at once', async () => {
    authStore.isAuthenticated = true
    const app = await openAt('/dashboard')
    wrapper = app.wrapper
    await app.router.push('/admin/users')
    await nextTick()
    expect(fadingIn()).toBe(false)
    await flushPromises()
    expect(wrapper.text()).toContain('users')
  })

  it('does not fade the first page of a visit', async () => {
    wrapper = (await openAt('/home')).wrapper
    expect(fadingIn()).toBe(false)
  })
})
