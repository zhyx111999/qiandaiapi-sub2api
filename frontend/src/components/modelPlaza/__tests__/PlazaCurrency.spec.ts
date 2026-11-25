import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlazaModelPricingTable from '../PlazaModelPricingTable.vue'
import PlazaMediaPricingTable from '../PlazaMediaPricingTable.vue'
import { plazaGroup, tokenModel } from './plazaFixtures'
import { defaultPlazaCurrencySettings, type PlazaPriceDisplay } from '@/utils/plazaCurrency'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key }) }))
vi.mock('@/composables/useClipboard', () => ({ useClipboard: () => ({ copyToClipboard: vi.fn() }) }))

const display: PlazaPriceDisplay = {
  usdToCny: 7,
  settings: { ...defaultPlazaCurrencySettings(), wallet_currency: 'CNY', wallet_unit_value: 2, customer_currency: 'USD', official_model_currencies: { 'claude-sonnet': 'CNY' } }
}

describe('Qiandai plaza upstream currency integration', () => {
  it('keeps discounted wallet prices separate from official model-specific currency', () => {
    const model = tokenModel()
    model.pricing!.image_minimum_charge = 7
    const wrapper = mount(PlazaModelPricingTable, { props: {
      models: [model], group: plazaGroup({ rate_multiplier: .5 }), priceMode: 'group', priceDisplay: display
    } })
    const input = wrapper.findAll('tbody td')[1].text()
    expect(input).toContain('$0.428571') // 3 credits/1M × .5 × 2 CNY / 7
    expect(input).toContain('¥21.00') // official $3 × 7
    expect(wrapper.get('[data-image-minimum-charge]').text()).toContain('$2.00') // floor is already the final charge
    wrapper.unmount()
  })

  it('converts image and reference prices with the independent media rate', () => {
    const model = tokenModel({ image: { tiers: [], reference_image_price: .07 } })
    model.pricing!.billing_mode = 'image'
    model.pricing!.per_request_price = .35
    const wrapper = mount(PlazaMediaPricingTable, { props: {
      models: [model], kind: 'request', group: plazaGroup({ rate_multiplier: .1, image_rate_independent: true, image_rate_multiplier: 1 }),
      priceMode: 'group', priceDisplay: display
    } })
    expect(wrapper.findAll('tbody td')[1].text()).toContain('$0.10')
    expect(wrapper.findAll('tbody td')[2].text()).toContain('$0.02')
    wrapper.unmount()
  })
})
