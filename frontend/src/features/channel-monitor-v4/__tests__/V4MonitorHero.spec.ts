import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import V4MonitorHero from '../V4MonitorHero.vue'

vi.mock('vue-i18n', async () => (await import('./i18n')).echoI18n())

const mountHero = (props: Partial<InstanceType<typeof V4MonitorHero>['$props']> = {}) =>
  mount(V4MonitorHero, { props: { status: 'operational', stale: false, range: '24h', loading: false, ...props } })

describe('V4MonitorHero', () => {
  it('offers exactly the windows the v2 read API serves and marks the current one', () => {
    const tabs = mountHero().findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual([
      'channelMonitorV2.ranges.90m',
      'channelMonitorV2.ranges.24h',
      'channelMonitorV2.ranges.7d',
      'channelMonitorV2.ranges.30d',
    ])
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['false', 'true', 'false', 'false'])
  })

  it('asks for another window or a refresh', async () => {
    const wrapper = mountHero()
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    expect(wrapper.emitted('update:range')).toEqual([['7d']])
    await wrapper.get('button[title="common.refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('shows the overall status, or that it may be outdated after a failed refresh', () => {
    expect(mountHero({ status: 'degraded' }).text()).toContain('channelMonitorV4.overall.degraded')
    expect(mountHero({ status: 'failed' }).text()).toContain('channelMonitorV4.overall.failed')
    expect(mountHero({ status: '' }).text()).toContain('channelMonitorV4.overall.unknown')
    expect(mountHero({ status: 'operational', stale: true }).text()).toContain('channelMonitorV4.overall.stale')
  })

  it('blocks a second refresh while loading', () => {
    expect(mountHero({ loading: true }).get('button[title="common.refresh"]').attributes('disabled')).toBeDefined()
  })
})
