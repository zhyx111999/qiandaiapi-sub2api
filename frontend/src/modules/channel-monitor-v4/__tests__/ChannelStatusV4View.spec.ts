import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import ChannelStatusV4View from '../ChannelStatusV4View.vue'
import { NOW, coverage, health, history, result, row } from './fixtures'

vi.mock('vue-i18n', async () => (await import('./i18n')).echoI18n())
const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(), getMatrix: vi.fn(), getInsights: vi.fn(), getUserGroupRates: vi.fn(), showError: vi.fn(), auth: { isAdmin: false },
}))
vi.mock('@/api/channelMonitorV2', () => ({ getSnapshot: mocks.getSnapshot, getMatrix: mocks.getMatrix }))
vi.mock('../api', () => ({ getInsights: mocks.getInsights }))
vi.mock('@/api/groups', () => ({ getUserGroupRates: mocks.getUserGroupRates }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: mocks.showError }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))

const DialogStub = defineComponent({ props: ['show', 'card', 'admin', 'now'], template: '<div data-testid="dialog" :data-show="show" :data-card="card?.key" :data-admin="admin" />' })
const stubs = { AppLayout: { template: '<main><slot /></main>' }, V4MonitorDetailDialog: DialogStub }

const snapshot = (over: Record<string, unknown> = {}) => ({
  config: { refresh_interval_seconds: 300, platforms: [{ platform: 'anthropic', enabled: true, models: [] }, { platform: 'openai', enabled: true, models: [] }] },
  coverage: coverage(),
  ...over,
})
const matrix = (items = [
  row({ platform: 'openai', group_id: 1, group_name: 'Codex', candy_checks: [history([result('correct', 1)])] }),
  row({ platform: 'anthropic', group_id: 2, group_name: 'Claude', health: health('critical') }),
]) => ({ coverage: coverage(), group_by: 'platform_group', items })

const mountView = () => mount(ChannelStatusV4View, { global: { stubs } })
const names = (wrapper: ReturnType<typeof mountView>) => wrapper.findAll('button.group').map((card) => card.find('.text-base').text())

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  mocks.auth.isAdmin = false
  mocks.getSnapshot.mockReset().mockResolvedValue(snapshot())
  mocks.getMatrix.mockReset().mockResolvedValue(matrix())
  mocks.getInsights.mockReset().mockResolvedValue([])
  mocks.getUserGroupRates.mockReset().mockResolvedValue({})
  mocks.showError.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('ChannelStatusV4View', () => {
  it('reads the 24h per-group matrix from the v2 API and lists the groups in platform order', async () => {
    const wrapper = mountView()
    await flushPromises()
    const filter = { range: '24h', platforms: [], groupIds: [], models: [] }
    expect(mocks.getSnapshot).toHaveBeenCalledWith(filter, false, expect.any(AbortSignal))
    expect(mocks.getMatrix).toHaveBeenCalledWith(filter, 'platform_group', false, expect.any(AbortSignal), { recentSamples: true })
    expect(names(wrapper)).toEqual(['Codex', 'Claude'])
    expect(wrapper.text()).toContain('channelMonitorV4.overall.failed')
  })

  it("reads the real-request samples of the listed groups and prefers the viewer's own rate", async () => {
    mocks.getUserGroupRates.mockResolvedValue({ 1: 0.072 })
    mocks.getInsights.mockResolvedValue([{
      group_id: 1, cache_rate: 0.713,
      samples: [{ at: new Date(NOW).toISOString(), first_token_ms: 23287, duration_ms: 40000, output_tokens: 800, image_count: 0, image_output_tokens: 0, billing_mode: null }],
    }])
    const wrapper = mountView()
    await flushPromises()
    expect(mocks.getInsights).toHaveBeenCalledWith([1, 2], false, expect.any(AbortSignal))
    const codex = wrapper.findAll('button.group')[0]
    expect(codex.get('[data-testid="v4-effective-rate"]').text()).toContain('×0.0720')
    expect(codex.get('[data-testid="v4-cache-rate"]').text()).toContain('71.3%')
    expect(codex.get('[data-testid="first-token-latest"]').text()).toBe('23.29s')
  })

  it('reads the admin endpoints for an administrator', async () => {
    mocks.auth.isAdmin = true
    mountView()
    await flushPromises()
    expect(mocks.getSnapshot.mock.calls[0][1]).toBe(true)
    expect(mocks.getMatrix.mock.calls[0][2]).toBe(true)
    expect(mocks.getInsights.mock.calls[0][1]).toBe(true)
  })

  it('sorts by the displayed personal rate and reorders after a refresh', async () => {
    mocks.getMatrix.mockResolvedValue(matrix([
      row({ platform: 'anthropic', group_id: 3, group_name: 'Claude high', group_rate_multiplier: 0.9 }),
      row({ group_id: 1, group_name: 'Codex personal', group_rate_multiplier: 0.8 }),
      row({ platform: 'anthropic', group_id: 4, group_name: 'Claude low', group_rate_multiplier: 0.25 }),
      row({ group_id: 2, group_name: 'Codex default', group_rate_multiplier: 0.15 }),
    ]))
    mocks.getUserGroupRates.mockResolvedValue({ 1: 0.072 })
    const wrapper = mountView()
    await flushPromises()
    expect(names(wrapper)).toEqual(['Codex personal', 'Codex default', 'Claude low', 'Claude high'])
    mocks.getUserGroupRates.mockResolvedValue({ 1: 0.3 })
    await wrapper.get('button[title="common.refresh"]').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['Codex default', 'Codex personal', 'Claude low', 'Claude high'])
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()
    expect(names(wrapper)).toEqual(['Codex default', 'Codex personal', 'Claude low', 'Claude high'])
  })

  it('reloads for another window', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()
    expect(mocks.getMatrix).toHaveBeenCalledTimes(2)
    expect(mocks.getMatrix.mock.calls[1][0]).toMatchObject({ range: '7d' })
    expect(wrapper.findAll('[role="tab"]')[2].attributes('aria-selected')).toBe('true')
    expect(names(wrapper)).toEqual(['Codex', 'Claude'])
  })

  it('refreshes at the cadence of the probes and the configured interval', async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot({ config: { refresh_interval_seconds: 300, platforms: [] } }))
    mocks.getMatrix.mockResolvedValue(matrix([row({ candy_checks: [history([], { interval_minutes: 2 })] })]))
    mountView()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(119_000)
    expect(mocks.getMatrix).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.getMatrix).toHaveBeenCalledTimes(2)
  })

  it('refreshes quickly while the server is still filling in history and says so', async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot({ coverage: coverage({ bootstrap: { active: true, progress_percent: 41.6 } }) }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="bootstrap-banner"]').text()).toContain('channelMonitorV2.bootstrap.progress:{"percent":42}')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.getMatrix).toHaveBeenCalledTimes(2)
  })

  it('marks the status outdated and keeps the cards when a refresh fails', async () => {
    const wrapper = mountView()
    await flushPromises()
    mocks.getMatrix.mockRejectedValue(new Error('down'))
    await wrapper.get('button[title="common.refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.showError).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('channelMonitorV4.overall.stale')
    expect(names(wrapper)).toEqual(['Codex', 'Claude'])
    mocks.getMatrix.mockResolvedValue(matrix())
    await wrapper.get('button[title="common.refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('channelMonitorV4.overall.stale')
    expect(names(wrapper)).toEqual(['Codex', 'Claude'])
  })

  it('shows an empty state without groups and skips groups the user cannot name', async () => {
    mocks.getMatrix.mockResolvedValue(matrix([row({ group_id: 0 })]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('channelMonitorV4.empty.title')
    expect(wrapper.text()).toContain('channelMonitorV4.overall.unknown')
  })

  it('opens the detail of the clicked group and closes it again', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="dialog"]').attributes('data-show')).toBe('false')
    await wrapper.findAll('button.group')[0].trigger('click')
    expect(wrapper.get('[data-testid="dialog"]').attributes()).toMatchObject({ 'data-show': 'true', 'data-card': 'openai-1' })
    wrapper.getComponent(DialogStub).vm.$emit('close')
    await flushPromises()
    expect(wrapper.get('[data-testid="dialog"]').attributes('data-show')).toBe('false')
  })

  it('ignores an answer that arrives after a newer request and stops on unmount', async () => {
    let release: (value: unknown) => void = () => undefined
    mocks.getMatrix.mockReset().mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    const wrapper = mountView()
    await flushPromises()
    const stale = mocks.getMatrix.mock.calls[0][3] as AbortSignal
    mocks.getMatrix.mockResolvedValue(matrix([row({ group_name: 'Fresh' })]))
    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    await flushPromises()
    expect(stale.aborted).toBe(true)
    release(matrix([row({ group_name: 'Old' })]))
    await flushPromises()
    expect(names(wrapper)).toEqual(['Fresh'])
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(mocks.getMatrix).toHaveBeenCalledTimes(2)
  })
})
