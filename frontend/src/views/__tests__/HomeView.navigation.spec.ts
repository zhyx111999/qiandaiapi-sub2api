import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import HomeView from '../HomeView.vue'
import ModelPlazaView from '../ModelPlazaView.vue'

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
      { path: '/home', component: HomeView },
      { path: '/model-plaza', component: ModelPlazaView },
      { path: '/login', component: { template: '<div>Login form route</div>' } },
    ],
  })
  await router.push('/home')
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, {
    global: {
      plugins: [router],
      stubs: { ConvergenceStage: true, LandingLocaleSwitch: true, LocaleSwitcher: true, Icon: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('home → original Sub2API model plaza', () => {
  let wrapper: Awaited<ReturnType<typeof openHome>>['wrapper'] | undefined
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => wrapper?.unmount())

  it('navigates to the actual model plaza component and requests its API, rather than returning to the offline demo', async () => {
    const app = await openHome()
    wrapper = app.wrapper
    await wrapper.get('.landing-nav__link[href="/model-plaza"]').trigger('click')
    await flushPromises()
    expect(app.router.currentRoute.value.path).toBe('/model-plaza')
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
