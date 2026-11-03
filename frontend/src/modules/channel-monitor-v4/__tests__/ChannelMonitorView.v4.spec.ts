import { defineComponent, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ChannelMonitorView from '@/views/admin/ChannelMonitorView.vue'

// The admin site-mode switch with the v4 option; the official switch itself is covered by
// src/views/admin/__tests__/ChannelMonitorView.modeSwitch.spec.ts, which stays untouched.
const mocks = vi.hoisted(() => ({ getView: vi.fn(), setView: vi.fn(), setMonitorMode: vi.fn(), fetchPublicSettings: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }))
const store = vi.hoisted(() => ({ settings: null as null | { channel_monitor_enabled: boolean; channel_monitor_mode: string } }))

vi.mock('@/utils/featureFlags', () => ({
  getChannelMonitorMode: () => store.settings!.channel_monitor_mode,
  isChannelMonitorV1Mode: () => store.settings!.channel_monitor_mode === 'v1',
}))
vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    get cachedPublicSettings() { return store.settings },
    fetchPublicSettings: mocks.fetchPublicSettings,
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
  }),
}))
vi.mock('../api', () => ({ getView: mocks.getView, setView: mocks.setView }))
vi.mock('@/api/channelMonitorV3', () => ({ setMonitorMode: mocks.setMonitorMode }))
vi.mock('@/api/admin', () => ({ adminAPI: { channelMonitor: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) } } }))
vi.mock('@/features/channel-monitor-v2/MonitorSettingsPanel.vue', () => ({ default: { template: '<div data-testid="v2-panel" />' } }))
vi.mock('@/features/channel-monitor-v3/V3SettingsPanel.vue', () => ({ default: { template: '<div data-testid="v3-panel" />' } }))
vi.mock('vue-i18n', async () => (await import('./i18n')).echoI18n())

const ConfirmStub = defineComponent({
  props: { show: Boolean, message: { type: String, default: '' } },
  emits: ['confirm', 'cancel'],
  template: '<div v-if="show" data-testid="confirm"><span>{{ message }}</span><button type="button" data-testid="confirm-yes" @click="$emit(\'confirm\')" /></div>',
})
const stubs = {
  AppLayout: { template: '<main><slot /></main>' },
  TablePageLayout: true, ConfirmDialog: ConfirmStub, MonitorFormDialog: true, MonitorTemplateManagerDialog: true,
  MonitorRunResultDialog: true, Icon: true, RouterLink: true,
}
const mountView = async () => {
  const wrapper = mount(ChannelMonitorView, { global: { stubs } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  // Under v4 the public settings carry the engine mode, v2.
  store.settings = reactive({ channel_monitor_enabled: true, channel_monitor_mode: 'v2' })
  mocks.getView.mockResolvedValue({ view: 'v4' })
  mocks.setView.mockImplementation(async (view: string) => ({ view }))
})

describe('channel monitor site mode switch with v4', () => {
  it('lists v4, selects it and opens the V2 tab, where v4 is configured', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="radio"]').map((button) => button.attributes('data-testid'))).toEqual([
      'monitor-mode-v1', 'monitor-mode-v2', 'monitor-mode-v3', 'monitor-mode-v4',
    ])
    expect(wrapper.get('[data-testid="monitor-mode-v4"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-testid="monitor-mode-v2"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('channelMonitorV4.modes.v4')
    expect(wrapper.text()).toContain('channelMonitorV4.admin.description.v4')
    expect(wrapper.find('[data-testid="v2-panel"]').exists()).toBe(true)
  })

  it('switches to v4 through the v4 endpoint after confirmation', async () => {
    mocks.getView.mockResolvedValue({ view: 'v1' })
    store.settings!.channel_monitor_mode = 'v1'
    const wrapper = await mountView()
    await wrapper.get('[data-testid="monitor-mode-v4"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm"]').text()).toContain('channelMonitorV4.admin.switchEffect.v4')
    await wrapper.get('[data-testid="confirm-yes"]').trigger('click')
    await flushPromises()
    expect(mocks.setView).toHaveBeenCalledWith('v4')
    expect(mocks.setMonitorMode).not.toHaveBeenCalled()
    expect(mocks.fetchPublicSettings).toHaveBeenCalledWith(true)
    expect(wrapper.get('[data-testid="monitor-mode-v4"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[data-testid="v2-panel"]').exists()).toBe(true)
    expect(mocks.showSuccess).toHaveBeenCalledWith('channelMonitorV3.admin.switched:{"mode":"channelMonitorV4.modes.v4"}')
  })

  it('switches back to an official mode through the same endpoint', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="monitor-mode-v3"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm"]').text()).toContain('channelMonitorV3.admin.switchEffect.v3')
    await wrapper.get('[data-testid="confirm-yes"]').trigger('click')
    await flushPromises()
    expect(mocks.setView).toHaveBeenCalledWith('v3')
    expect(mocks.setMonitorMode).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="v3-panel"]').exists()).toBe(true)
  })
})
