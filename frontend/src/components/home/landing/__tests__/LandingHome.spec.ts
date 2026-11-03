import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LandingHome from '../LandingHome.vue'
import ModelPlazaView from '@/views/ModelPlazaView.vue'

const { appStore, authStore, getModelPlaza } = vi.hoisted(() => ({
  appStore: {
    cachedPublicSettings: {
      site_name: 'Navigation test site',
      model_plaza_enabled: true,
      model_plaza_require_auth: false,
    },
    siteName: 'Navigation test site',
    siteLogo: '',
    docUrl: '',
    publicSettingsLoaded: true,
    fetchPublicSettings: vi.fn().mockResolvedValue(undefined),
  },
  authStore: { isAuthenticated: false, isAdmin: false, user: null, checkAuth: vi.fn() },
  // Isolated test fixture, not displayed or stored in a real instance.
  getModelPlaza: vi.fn().mockResolvedValue({ description: '', groups: [] }),
}))

vi.mock('@/stores', () => ({ useAppStore: () => appStore, useAuthStore: () => authStore }))
vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authStore }))
vi.mock('@/api/modelPlaza', () => ({ getModelPlaza }))
vi.mock('@/components/layout/AppLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh' } }),
}))

async function openHome() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: LandingHome },
      { path: '/model-plaza', component: ModelPlazaView },
      { path: '/login', component: { template: '<div>Login form route</div>' } },
      { path: '/dashboard', component: { template: '<div>User dashboard</div>' } },
      { path: '/admin/dashboard', component: { template: '<div>Admin dashboard</div>' } },
    ],
  })
  await router.push('/home')
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, {
    global: {
      plugins: [router],
      // The canvas stage has no jsdom implementation; its logic is covered by the convergence unit tests.
      stubs: { ConvergenceStage: true, LandingLocaleSwitch: true, LocaleSwitcher: true, Icon: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

let wrapper: Awaited<ReturnType<typeof openHome>>['wrapper'] | undefined

beforeEach(() => {
  vi.clearAllMocks()
  authStore.isAuthenticated = false
  authStore.isAdmin = false
})
afterEach(() => wrapper?.unmount())

describe('home console entry', () => {
  it('refreshes auth on mount, sends visitors to login and offers a header login link', async () => {
    wrapper = (await openHome()).wrapper
    expect(authStore.checkAuth).toHaveBeenCalledOnce()
    expect(wrapper.get('.landing-btn--primary').attributes('href')).toBe('/login')
    expect(wrapper.get('.landing-login').attributes('href')).toBe('/login')
  })

  it('sends signed-in users to their dashboard and hides the header login link', async () => {
    authStore.isAuthenticated = true
    wrapper = (await openHome()).wrapper
    expect(wrapper.get('.landing-btn--primary').attributes('href')).toBe('/dashboard')
    expect(wrapper.find('.landing-login').exists()).toBe(false)
  })

  it('sends administrators to the admin dashboard', async () => {
    authStore.isAuthenticated = true
    authStore.isAdmin = true
    wrapper = (await openHome()).wrapper
    expect(wrapper.get('.landing-btn--primary').attributes('href')).toBe('/admin/dashboard')
  })
})

describe('home → original Sub2API model plaza', () => {
  it('leaves navigation and the model plaza entry to the site nav, keeping only the brand, language and sign-in', async () => {
    const app = await openHome()
    wrapper = app.wrapper
    expect(wrapper.get('.landing-brand__text strong').text()).toBe('QiandaiAPI')
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.find('a[href="/model-plaza"]').exists()).toBe(false)
  })

  it('opens the actual model plaza component and requests its API', async () => {
    const app = await openHome()
    wrapper = app.wrapper
    await app.router.push('/model-plaza')
    await flushPromises()
    expect(wrapper.findComponent(ModelPlazaView).exists()).toBe(true)
    expect(getModelPlaza).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('modelPlaza.empty')
  })

  it('keeps the model plaza as the return URL when an anonymous visitor signs in', async () => {
    const app = await openHome()
    wrapper = app.wrapper
    await app.router.push('/model-plaza')
    await flushPromises()
    await wrapper.get('a[href="/login?redirect=/model-plaza"]').trigger('click')
    await flushPromises()
    expect(app.router.currentRoute.value.path).toBe('/login')
    expect(app.router.currentRoute.value.query.redirect).toBe('/model-plaza')
  })
})
