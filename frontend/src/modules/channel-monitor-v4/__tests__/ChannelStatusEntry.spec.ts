import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import ChannelStatusEntry from '../ChannelStatusEntry.vue'

const mocks = vi.hoisted(() => ({ getView: vi.fn(), mode: { value: 'v2' } }))
vi.mock('../api', () => ({ getView: mocks.getView, setView: vi.fn() }))
vi.mock('@/utils/featureFlags', () => ({ getChannelMonitorMode: () => mocks.mode.value }))
vi.mock('@/views/user/ChannelStatusView.vue', () => ({ default: defineComponent({ setup: () => () => h('div', { 'data-testid': 'official' }) }) }))
vi.mock('../ChannelStatusV4View.vue', () => ({ default: defineComponent({ setup: () => () => h('div', { 'data-testid': 'v4' }) }) }))

const shown = async () => {
  const wrapper = mount(ChannelStatusEntry)
  await flushPromises()
  return ['official', 'v4'].filter((id) => wrapper.find(`[data-testid="${id}"]`).exists())
}

beforeEach(() => {
  mocks.getView.mockReset()
  mocks.mode.value = 'v2'
})

describe('ChannelStatusEntry', () => {
  it('shows the v4 page when the site runs v4', async () => {
    mocks.getView.mockResolvedValue({ view: 'v4' })
    expect(await shown()).toEqual(['v4'])
  })

  it.each(['v1', 'v2', 'v3'])('shows the official page for %s', async (view) => {
    mocks.getView.mockResolvedValue({ view })
    expect(await shown()).toEqual(['official'])
  })

  it('shows the official page when the site cannot answer', async () => {
    mocks.getView.mockRejectedValue(new Error('404'))
    expect(await shown()).toEqual(['official'])
  })

  it('renders nothing until the site has answered, so the wrong page never flashes', async () => {
    mocks.getView.mockReturnValue(new Promise(() => undefined))
    expect(await shown()).toEqual([])
  })
})
