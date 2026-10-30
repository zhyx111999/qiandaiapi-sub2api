import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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
import { consoleLayouts } from '../consolePresence'

const page = { template: '<div />' }

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/home', '/model-plaza', '/login', '/dashboard', '/admin/dashboard', '/admin/users'].map((p) => ({ path: p, component: page })),
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(SiteNav, { global: { plugins: [router], stubs: { ToolbarLens: true } }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

const links = (w: VueWrapper) => w.findAll('a.site-nav__link').map((a) => a.attributes('href'))
const current = (w: VueWrapper) => w.find('a[aria-current="page"]').attributes('href')

let wrapper: VueWrapper | undefined
beforeEach(() => {
  authStore.isAuthenticated = false
  authStore.isAdmin = false
  flags.plaza = true
  consoleLayouts.value = 0
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('site nav', () => {
  it('on the cover: home, platform (sign-in for visitors) and the public model plaza', async () => {
    wrapper = (await mountAt('/home')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/login', '/model-plaza'])
    expect(current(wrapper)).toBe('/home')
    expect(wrapper.get('nav').classes()).toContain('site-nav--cover')
    expect(document.documentElement.classList.contains('has-site-nav')).toBe(true)
  })

  it('in the console: the dashboard as platform and the model plaza inside the console', async () => {
    authStore.isAuthenticated = true
    consoleLayouts.value = 1
    wrapper = (await mountAt('/admin/users')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/dashboard', '/model-plaza?embedded=1'])
    expect(current(wrapper)).toBe('/dashboard')
  })

  it('sends administrators to the admin dashboard, and marks the plaza while on it', async () => {
    authStore.isAuthenticated = true
    authStore.isAdmin = true
    wrapper = (await mountAt('/model-plaza')).wrapper
    expect(links(wrapper)[1]).toBe('/admin/dashboard')
    expect(current(wrapper)).toBe('/model-plaza?embedded=1')
  })

  it('leaves the model plaza out when it is switched off', async () => {
    flags.plaza = false
    wrapper = (await mountAt('/home')).wrapper
    expect(links(wrapper)).toEqual(['/home', '/login'])
  })

  it('hides on pages outside the cover, the plaza and the console', async () => {
    wrapper = (await mountAt('/login')).wrapper
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(document.documentElement.classList.contains('has-site-nav')).toBe(false)
  })

  it('goes away a moment after leaving for such a page', async () => {
    const app = await mountAt('/home')
    wrapper = app.wrapper
    await app.router.push('/login')
    await flushPromises()
    expect(wrapper.find('nav').exists()).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('is the same element across the switch from the cover to the console, and fades the page in', async () => {
    authStore.isAuthenticated = true
    const app = await mountAt('/home')
    wrapper = app.wrapper
    const nav = wrapper.get('nav').element
    // As in the app: the route changes first, the console layout mounts after it.
    await app.router.push('/dashboard')
    await flushPromises()
    consoleLayouts.value = 1
    await flushPromises()
    expect(wrapper.get('nav').element).toBe(nav)
    expect(current(wrapper)).toBe('/dashboard')
    expect(document.documentElement.classList.contains('site-entering')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(document.documentElement.classList.contains('site-entering')).toBe(false)
  })
})
