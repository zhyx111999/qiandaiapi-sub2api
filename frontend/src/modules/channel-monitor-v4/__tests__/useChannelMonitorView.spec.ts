import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { monitorModeKey, useChannelMonitorView } from '../useChannelMonitorView'

const mocks = vi.hoisted(() => ({ getView: vi.fn(), setView: vi.fn(), mode: { value: 'v2' } }))
vi.mock('../api', () => ({ getView: mocks.getView, setView: mocks.setView }))
vi.mock('@/utils/featureFlags', () => ({ getChannelMonitorMode: () => mocks.mode.value }))

async function useView() {
  let api!: ReturnType<typeof useChannelMonitorView>
  mount(defineComponent({ setup: () => { api = useChannelMonitorView(); return () => null } }))
  await flushPromises()
  return api
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => typeof mock === 'function' && mock.mockReset())
  mocks.mode.value = 'v2'
})

describe('useChannelMonitorView', () => {
  it('offers v4 beside the official modes and switches every mode through the v4 endpoint', async () => {
    mocks.getView.mockResolvedValue({ view: 'v4' })
    mocks.setView.mockResolvedValue({ view: 'v1' })
    const monitor = await useView()
    expect(monitor.ready.value).toBe(true)
    expect(monitor.view.value).toBe('v4')
    expect(monitor.modes.value).toEqual(['v1', 'v2', 'v3', 'v4'])

    await monitor.apply('v1')
    expect(mocks.setView).toHaveBeenCalledWith('v1')
    expect(monitor.view.value).toBe('v1')
  })

  it('falls back to the saved official mode when the site cannot answer', async () => {
    mocks.getView.mockRejectedValue(new Error('404'))
    mocks.mode.value = 'v1'
    const monitor = await useView()
    expect(monitor.ready.value).toBe(true)
    expect(monitor.view.value).toBe('v1')
  })

  it('is not ready before the site answers', async () => {
    mocks.getView.mockReturnValue(new Promise(() => undefined))
    expect((await useView()).ready.value).toBe(false)
  })

  it('keeps the official texts for v1 to v3 and adds its own for v4', () => {
    expect(monitorModeKey('modes', 'v2')).toBe('channelMonitorV3.modes.v2')
    expect(monitorModeKey('admin.description', 'off')).toBe('channelMonitorV3.admin.description.off')
    expect(monitorModeKey('admin.switchEffect', 'v4')).toBe('channelMonitorV4.admin.switchEffect.v4')
    expect(monitorModeKey('modes', 'v4')).toBe('channelMonitorV4.modes.v4')
  })
})
