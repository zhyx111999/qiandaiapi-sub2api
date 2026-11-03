import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { buildCards } from '../cards'
import V4MonitorCard from '../V4MonitorCard.vue'
import { NOW, history, noTraffic, result, row } from './fixtures'

vi.mock('vue-i18n', async () => (await import('./i18n')).echoI18n())

const sample = { at: new Date(NOW).toISOString(), first_token_ms: 23287, duration_ms: 40000, output_tokens: 800, image_count: 0, image_output_tokens: 0, billing_mode: null }
const insights = new Map([[1, { group_id: 1, cache_rate: 0.713, samples: [sample, { ...sample, first_token_ms: 900 }] }]])
const cardOf = (over: Parameters<typeof row>[0], extra: { insights?: typeof insights; userRates?: Record<number, number> } = {}) =>
  buildCards([row(over)], [], { timelineMode: 'samples', now: NOW, ...extra })[0]
const mountCard = (over: Parameters<typeof row>[0], range: '90m' | '24h' | '7d' | '30d' = '24h', extra = {}) =>
  mount(V4MonitorCard, { props: { card: cardOf(over, extra), range, countdownSeconds: 42 } })

describe('V4MonitorCard', () => {
  it('shows real-request first token and speed, effective rate, cache rate, samples and the probe strip', () => {
    const wrapper = mountCard({ candy_checks: [history([result('correct', 1, 1234)]), history([], { model: 'b' })] }, '24h', { insights, userRates: { 1: 0.072 } })
    const text = wrapper.text()
    expect(text).toContain('Codex')
    expect(text).toContain('gpt-5 · medium')
    expect(text).toContain('monitorCommon.status.operational')
    expect(text).toContain('channelMonitorV4.card.latestFirstToken')
    expect(text).toContain('23287')
    expect(text).toContain('20.0')
    expect(wrapper.get('[data-testid="v4-effective-rate"]').text()).toContain('×0.0720')
    expect(wrapper.get('[data-testid="v4-cache-rate"]').text()).toContain('71.3%')
    expect(wrapper.get('[data-testid="first-token-latest"]').text()).toBe('23.29s')
    expect(wrapper.findAll('[data-testid="v4-first-token-samples"] [role="img"]')).toHaveLength(2)
    expect(text).toContain('channelMonitorV4.card.firstTokenSamples:{"n":2}')
    expect(text).toContain('channelMonitorV4.card.availability · channelMonitorV2.ranges.24h')
    expect(text).toContain('channelMonitorV4.card.candyAccuracy:{"value":"100"}')
    expect(text).toContain('monitorCommon.extraModelsCount:{"n":1}')
    expect(text).toContain('monitorCommon.nextUpdateIn:{"n":42}')
  })

  it('does not invent figures for a group without probes or traffic', () => {
    const wrapper = mountCard({ metrics: noTraffic(), health: { overall: 'unknown', error_rate: 'unknown', ttft: 'unknown', minimum_sample: 10 }, group_rate_multiplier: undefined })
    const text = wrapper.text()
    expect(text).toContain('channelMonitorV4.overall.unknown')
    expect(text).not.toContain('channelMonitorV4.card.candyAccuracy')
    expect(wrapper.get('[data-testid="v4-effective-rate"]').text()).toContain('—')
    expect(wrapper.get('[data-testid="v4-cache-rate"]').text()).toContain('—')
    expect(wrapper.get('[data-testid="first-token-latest"]').text()).toBe('-')
    expect(text).toContain('channelMonitorV4.card.realFirstTokensEmpty')
    expect(text).toContain('monitorCommon.latencyEmpty')
  })

  it('opens on click and follows the selected range', async () => {
    const wrapper = mountCard({}, '7d')
    expect(wrapper.text()).toContain('channelMonitorV2.ranges.7d')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
