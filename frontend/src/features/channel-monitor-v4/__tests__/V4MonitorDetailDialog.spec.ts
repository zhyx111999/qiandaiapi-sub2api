import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCards } from '../cards'
import V4MonitorDetailDialog from '../V4MonitorDetailDialog.vue'
import { NOW, health, history, metric, modelRow, result, row } from './fixtures'

vi.mock('vue-i18n', async () => (await import('./i18n')).echoI18n())
const { getModels } = vi.hoisted(() => ({ getModels: vi.fn() }))
vi.mock('@/api/channelMonitorV2', () => ({ getModels }))

const stubs = { BaseDialog: { props: ['show', 'title'], template: '<div v-if="show"><h1>{{ title }}</h1><slot /><slot name="footer" /></div>' } }
const cardOf = (over: Parameters<typeof row>[0] = {}) =>
  buildCards([row({ group_id: 7, group_name: 'Codex', ...over })], [], { timelineMode: 'samples', now: NOW })[0]
const mountDialog = (props: Record<string, unknown>) => mount(V4MonitorDetailDialog, { props: { show: true, card: cardOf(), admin: false, now: NOW, ...props }, global: { stubs } })

beforeEach(() => {
  getModels.mockReset().mockImplementation(async (filter: { range: string }) => ({
    items: filter.range === '30d' ? [modelRow('gpt-5', { metrics: metric({ error_rate: 0.3 }) })] : [modelRow('gpt-5', { health: health('warning') })],
  }))
})

describe('V4MonitorDetailDialog', () => {
  it('asks nothing until opened', async () => {
    mountDialog({ show: false })
    await flushPromises()
    expect(getModels).not.toHaveBeenCalled()
  })

  it('reads the group over 24h, 7d and 30d with the caller\'s read scope', async () => {
    const wrapper = mountDialog({ admin: true })
    await flushPromises()
    expect(getModels.mock.calls.map(([filter, admin]) => [filter, admin])).toEqual(
      ['24h', '7d', '30d'].map((range) => [{ range, platforms: ['openai'], groupIds: [7], models: [] }, true]),
    )
    const rows = wrapper.get('[data-testid="passive-table"] tbody').findAll('tr')
    expect(rows).toHaveLength(1)
    const cells = rows[0].findAll('td').map((cell) => cell.text())
    expect(cells[0]).toBe('gpt-5')
    expect(cells[1]).toBe('channelMonitorV2.cards.health.warning')
    expect(cells.slice(3)).toEqual(['90.00%', '90.00%', '70.00%'])
  })

  it('lists each probe with its latest verdict, accuracy and latencies from the card data', async () => {
    const checks = [history([result('correct', 3, 1000), result('incorrect', 1, 3000)]), history([], { model: 'claude', reasoning_effort: 'high' })]
    const wrapper = mountDialog({ card: cardOf({ candy_checks: checks }) })
    await flushPromises()
    const rows = wrapper.get('[data-testid="candy-table"] tbody').findAll('tr').map((tr) => tr.findAll('td').map((td) => td.text()))
    expect(rows[0]).toEqual(['gpt-5 · medium', 'channelMonitorV2.candy.states.incorrect', '3.0s', '50.00%', '2.0s'])
    expect(rows[1]).toEqual(['claude · high', 'channelMonitorV2.candy.states.unknown', '-', '-', '-'])
  })

  it('says so when the group has no probes or no traffic', async () => {
    getModels.mockResolvedValue({ items: [] })
    const wrapper = mountDialog({ card: cardOf({ candy_checks: [] }) })
    await flushPromises()
    expect(wrapper.text()).toContain('channelMonitorV4.detail.noCandy')
    expect(wrapper.text()).toContain('channelMonitorV4.detail.noPassive')
  })

  it('reports a failed read and keeps the probe table', async () => {
    getModels.mockRejectedValue(new Error('down'))
    const wrapper = mountDialog({ card: cardOf({ candy_checks: [history([result('correct', 1)])] }) })
    await flushPromises()
    expect(wrapper.text()).toContain('channelMonitorV4.detail.loadFailed')
    expect(wrapper.find('[data-testid="candy-table"]').exists()).toBe(true)
  })

  it('cancels the read when closed, and does not re-read when the page refreshes the card', async () => {
    const wrapper = mountDialog({})
    await flushPromises()
    expect(getModels).toHaveBeenCalledTimes(3)
    await wrapper.setProps({ card: cardOf({ metrics: metric({ error_rate: 0.5 }) }) })
    await flushPromises()
    expect(getModels).toHaveBeenCalledTimes(3)

    getModels.mockClear()
    getModels.mockImplementation(() => new Promise(() => undefined))
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    const signal = getModels.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(false)
    await wrapper.setProps({ show: false })
    expect(signal.aborted).toBe(true)
  })

  it('shows a progress line while reading', async () => {
    getModels.mockImplementation(() => new Promise(() => undefined))
    const wrapper = mountDialog({})
    await flushPromises()
    expect(wrapper.text()).toContain('common.loading')
  })
})
