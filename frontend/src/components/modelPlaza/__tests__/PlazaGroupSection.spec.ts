import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlazaGroupSection from '../PlazaGroupSection.vue'
import PlazaModelPricingTable from '../PlazaModelPricingTable.vue'
import PlazaMediaPricingTable from '../PlazaMediaPricingTable.vue'
import PlazaNovelAIAddonPricing from '../PlazaNovelAIAddonPricing.vue'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import { imageModel, interval, novelAIPixelModel, plazaGroup, tokenModel } from './plazaFixtures'

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) }
})

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ cachedPublicSettings: null })
}))

function ladderModel(tiers: number): PlazaModel {
  const m = tokenModel({ name: 'gpt-5.6-sol', platform: 'openai' })
  m.official_pricing!.intervals = Array.from({ length: tiers }, (_, i) =>
    interval({ min_tokens: i * 272000, max_tokens: i === tiers - 1 ? null : (i + 1) * 272000, input_price: 5e-6 })
  )
  return m
}

function mountSection(overrides: Partial<ModelPlazaGroup> = {}) {
  return mount(PlazaGroupSection, {
    props: { group: plazaGroup({ models: [ladderModel(2)], ...overrides }), priceMode: 'group' },
    global: { stubs: { GroupBadge: true, Icon: true, PlazaModelPricingTable: true, PlazaMediaPricingTable: true, PlazaNovelAIAddonPricing: true } }
  })
}

const NOTE = 'modelPlaza.detail.longContextDisabledNote'

describe('PlazaGroupSection', () => {
  it.each(['novelai', 'composite'])('inserts one static NovelAI add-on block directly after the pixel table (%s)', async (platform) => {
    const wrapper = mountSection({
      platform,
      rate_multiplier: 3,
      image_rate_independent: true,
      image_rate_multiplier: 2,
      models: [
        tokenModel(),
        novelAIPixelModel([0.05, 0.5, 0.65, 0.8, 0.95]),
        novelAIPixelModel([0.05, 0.05, 0.05, 0.05, 0.05], 'nai-flat')
      ]
    })
    expect(wrapper.findAllComponents(PlazaNovelAIAddonPricing)).toHaveLength(1)
    const addon = wrapper.findComponent(PlazaNovelAIAddonPricing)
    const pixelTable = wrapper.findAllComponents(PlazaMediaPricingTable).find((table) => table.props('kind') === 'resolution')!
    expect(addon.element.previousElementSibling).toBe(pixelTable.element)
    expect(addon.props()).toEqual({}) // Static prices are not derived from model/group multipliers.
    await wrapper.setProps({ priceMode: 'official' })
    expect(wrapper.findAllComponents(PlazaNovelAIAddonPricing)).toHaveLength(1)
  })

  it('follows the NovelAI request table when its image tiers all have the same price', () => {
    const wrapper = mountSection({
      platform: 'novelai',
      models: [novelAIPixelModel([0.05, 0.05, 0.05, 0.05, 0.05])]
    })
    const media = wrapper.findComponent(PlazaMediaPricingTable)
    expect(media.props('kind')).toBe('request')
    expect(wrapper.findComponent(PlazaNovelAIAddonPricing).element.previousElementSibling).toBe(media.element)
  })

  it('hides add-ons for other providers, an empty group, and NovelAI filtered out of a composite group', async () => {
    expect(mountSection().findComponent(PlazaNovelAIAddonPricing).exists()).toBe(false)
    expect(mountSection({ platform: 'novelai', models: [] }).findComponent(PlazaNovelAIAddonPricing).exists()).toBe(false)
    const otherImage = imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1 })
    const wrapper = mountSection({
      platform: 'composite',
      models: [otherImage, novelAIPixelModel([0.05, 0.5, 0.65, 0.8, 0.95])]
    })
    expect(wrapper.findComponent(PlazaNovelAIAddonPricing).exists()).toBe(true)
    await wrapper.setProps({ group: plazaGroup({ platform: 'composite', models: [otherImage] }) })
    expect(wrapper.findComponent(PlazaNovelAIAddonPricing).exists()).toBe(false)
  })

  it('按定价方式拆成多张表：token / 按分辨率 / 按次各一张，价格口径透传', () => {
    const wrapper = mountSection({
      models: [
        tokenModel({ platform: 'openai' }),
        imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1 }),
        imageModel('gpt-image-1k', { '1K': 0.001, '2K': 0.001 })
      ]
    })
    const token = wrapper.findComponent(PlazaModelPricingTable)
    expect(token.props('models').map((m: PlazaModel) => m.name)).toEqual(['claude-sonnet'])
    expect(token.props('priceMode')).toBe('group')
    const media = wrapper.findAllComponents(PlazaMediaPricingTable)
    expect(media.map((t) => [t.props('kind'), t.props('models').map((m: PlazaModel) => m.name)])).toEqual([
      ['resolution', ['gpt-image-2']],
      ['request', ['gpt-image-1k']]
    ])
  })

  it('分组关闭阶梯且组内有官方阶梯模型时显示说明，其余情况不显示', () => {
    expect(mountSection({ long_context_pricing_enabled: false }).text()).toContain(NOTE)
    expect(mountSection({ long_context_pricing_enabled: true }).text()).not.toContain(NOTE)
    expect(mountSection({ long_context_pricing_enabled: false, models: [ladderModel(1)] }).text()).not.toContain(NOTE)
  })

  it('分组启用高峰时把窗口描述传给 token 表，未启用为空串', () => {
    const peak = mountSection({ peak_rate_enabled: true, peak_start: '14:00', peak_end: '18:00', peak_rate_multiplier: 1.5 })
    // appStore mock 无 server_utc_offset,窗口描述不带时区标注
    expect(peak.findComponent(PlazaModelPricingTable).props('peakWindow')).toBe('14:00-18:00 ×1.5')
    expect(mountSection().findComponent(PlazaModelPricingTable).props('peakWindow')).toBe('')
  })
})
