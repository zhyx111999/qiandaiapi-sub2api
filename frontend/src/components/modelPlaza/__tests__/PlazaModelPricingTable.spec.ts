import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlazaModelPricingTable from '../PlazaModelPricingTable.vue'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import type { PlazaPriceMode } from '../plazaRates'
import { interval, plazaGroup, tokenModel } from './plazaFixtures'

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return { ...actual, useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }) }
})

vi.mock('@/composables/useClipboard', () => ({
  useClipboard: () => ({ copyToClipboard: vi.fn(async () => true) })
}))

function mountTable(models: PlazaModel[], group: Partial<ModelPlazaGroup> = {}, priceMode: PlazaPriceMode = 'group', peakWindow = '') {
  return mount(PlazaModelPricingTable, { props: { models, group: plazaGroup(group), priceMode, peakWindow } })
}

function cells(wrapper: ReturnType<typeof mountTable>, row = 0): string[] {
  return wrapper.findAll('tbody tr')[row].findAll('td').map((td) => td.text())
}

describe('PlazaModelPricingTable', () => {
  it('分组价格：单价 × 生效倍率（$/1M，保底 2 位小数），下方划线展示官方价', () => {
    const [, input, output, cache, rate] = cells(mountTable([tokenModel()], { rate_multiplier: 0.5 }))
    expect(input).toContain('$1.50')
    expect(input).toContain('modelPlaza.table.officialPrice $3.00')
    expect(output).toContain('$7.50')
    expect(cache).toContain('$1.875')
    expect(cache).toContain('$0.15')
    expect(rate).toBe('0.5x')
  })

  it('官方价格：展示官方参考价（含 1h 缓存写入），不乘倍率、无倍率列与划线', () => {
    const wrapper = mountTable([tokenModel()], { rate_multiplier: 0.5 }, 'official')
    const [, input, , cache] = cells(wrapper)
    expect(input).toBe('$3.00')
    expect(cache).toContain('(1h $6.00)')
    expect(wrapper.findAll('thead th')).toHaveLength(4)
    expect(wrapper.text()).not.toContain('modelPlaza.table.officialPrice')
  })

  it('用户专属倍率覆盖分组倍率，并划线展示原倍率', () => {
    const wrapper = mountTable([tokenModel()], { rate_multiplier: 1, user_rate_multiplier: 0.8 })
    expect(cells(wrapper)[1]).toContain('$2.40')
    expect(wrapper.find('.line-through').text()).toBe('1x')
  })

  it('模型按官方输出价从高到低，无官方价的排最后', () => {
    const cheap = tokenModel({ name: 'cheap', official_pricing: { input_price: 1e-6, output_price: 2e-6, cache_write_price: null, cache_read_price: null } })
    const none = tokenModel({ name: 'none', official_pricing: null })
    const wrapper = mountTable([none, cheap, tokenModel()], { platform: 'anthropic' })
    expect(wrapper.findAll('tbody tr').map((r) => r.find('td').text())).toEqual(['claude-sonnet', 'cheap', 'none'])
  })

  it('按级别顺序展示已配置的思考等级倍率，按 token 计费的生图模型带生图徽章', () => {
    const m = tokenModel({ image: { tiers: [] } })
    m.pricing!.reasoning_effort_multipliers = { xhigh: 2, low: 0.5, bogus: 3, high: -1 }
    const wrapper = mountTable([m])
    expect(wrapper.findAll('[data-reasoning-effort]').map((b) => b.attributes('data-reasoning-effort'))).toEqual(['low', 'xhigh'])
    expect(wrapper.text()).toContain('modelPlaza.table.imageModel')
  })

  it('阶梯定价每档一行并乘倍率，档位标签只在输入列；官方口径改用官方阶梯', () => {
    const m = tokenModel()
    m.pricing!.intervals = [
      interval({ max_tokens: 200000, input_price: 3e-6, output_price: 1.5e-5, cache_read_price: 3e-7 }),
      interval({ min_tokens: 200000, input_multiplier: 2, output_multiplier: 1.5, cache_read_multiplier: 2 })
    ]
    m.official_pricing!.intervals = [interval({ max_tokens: 128000, input_price: 1e-6, output_price: 1e-6 })]
    const [, input, output, cache] = cells(mountTable([m], { rate_multiplier: 2 }))
    expect(input).toContain('≤200K')
    expect(input).toContain('>200K')
    expect(input).toContain('$12.00')
    expect(output).not.toContain('K')
    expect(output).toContain('$45.00')
    expect(cache).toContain('$1.20')
    expect(cells(mountTable([m], {}, 'official'))[1]).toContain('≤128K')
  })

  it('分时倍率：标准行 + 每时段一行，时段行价格与倍率按时段倍率折算，tooltip 披露高峰', () => {
    const m = tokenModel({
      time_pricing: { timezone: 'Asia/Shanghai', weekdays_only: true, periods: [{ start_time: '00:30:00', end_time: '08:30:00', multiplier: 0.5 }] }
    })
    const wrapper = mountTable([m], { rate_multiplier: 2, peak_rate_multiplier: 1.5 }, 'group', '14:00-18:00 ×1.5')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    const [name, input, , , rate] = cells(wrapper, 1)
    expect(name).toContain('modelPlaza.table.timePricingWeekdays')
    expect(name).toContain('00:30–08:30')
    expect(input).toBe('$3.00')
    expect(rate).toBe('1x')
    const badge = wrapper.findAll('tbody tr')[1].find('.plaza-badge[title]')
    expect(badge.attributes('title')).toContain('timePricingRowHintWeekdays')
    expect(badge.attributes('title')).toContain('timePricingRowHintPeak')
    expect(mountTable([m], {}, 'official').findAll('tbody tr')).toHaveLength(1)
  })

  it('Composite 分组中模型平台与分组不同时加平台徽章，模型名旁有复制按钮', () => {
    const wrapper = mountTable([tokenModel({ platform: 'anthropic' })], { platform: 'composite' })
    expect(wrapper.find('tbody td').text()).toContain('claude-sonnet')
    expect(wrapper.find('.plaza-copy').exists()).toBe(true)
    expect(wrapper.find('tbody td').findAll('span').length).toBeGreaterThan(1)
  })
})
