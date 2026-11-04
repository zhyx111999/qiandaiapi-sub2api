import { defineComponent, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ChannelMonitorView from '@/views/admin/ChannelMonitorView.vue'

// v4 in the admin site-mode switch: a mode of its own, switched by the official endpoint and
// configured in the V2 tab. The official switch is covered by
// src/views/admin/__tests__/ChannelMonitorView.modeSwitch.spec.ts.
const mocks = vi.hoisted(() => ({ setMonitorMode: vi.fn(), fetchPublicSettings: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }))
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
  store.settings = reactive({ channel_monitor_enabled: true, channel_monitor_mode: 'v4' })
  mocks.setMonitorMode.mockImplementation(async (mode: string) => mode)
  mocks.fetchPublicSettings.mockImplementation(async () => {
    store.settings!.channel_monitor_mode = mocks.setMonitorMode.mock.calls.at(-1)?.[0] ?? store.settings!.channel_monitor_mode
    return store.settings
  })
})

describe('channel monitor site mode v4', () => {
  it('lists v4 as a mode, selects it and opens the V2 tab, where v4 is configured', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="radio"]').map((button) => button.attributes('data-testid'))).toEqual([
      'monitor-mode-v1', 'monitor-mode-v2', 'monitor-mode-v3', 'monitor-mode-v4',
    ])
    expect(wrapper.get('[data-testid="monitor-mode-v4"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('channelMonitorV3.modes.v4')
    expect(wrapper.text()).toContain('channelMonitorV3.admin.description.v4')
    expect(wrapper.find('[data-testid="v2-panel"]').exists()).toBe(true)
  })

  it('switches to v4 through the official mode endpoint after confirmation', async () => {
    store.settings!.channel_monitor_mode = 'v1'
    const wrapper = await mountView()
    await wrapper.get('[data-testid="monitor-mode-v4"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm"]').text()).toContain('channelMonitorV3.admin.switchEffect.v4')
    await wrapper.get('[data-testid="confirm-yes"]').trigger('click')
    await flushPromises()
    expect(mocks.setMonitorMode).toHaveBeenCalledWith('v4')
    expect(mocks.fetchPublicSettings).toHaveBeenCalledWith(true)
    expect(wrapper.get('[data-testid="monitor-mode-v4"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[data-testid="v2-panel"]').exists()).toBe(true)
    expect(mocks.showSuccess).toHaveBeenCalledWith('channelMonitorV3.admin.switched:{"mode":"channelMonitorV3.modes.v4"}')
  })
})
