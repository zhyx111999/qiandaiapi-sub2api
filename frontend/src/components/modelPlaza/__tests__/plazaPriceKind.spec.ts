import { describe, expect, it } from 'vitest'
import { flatRequestPrice, imageTierPrices, partitionByPriceKind, priceKind } from '../plazaPriceKind'
import { vendorOf } from '../plazaVendors'
import { imageModel, interval, tokenModel } from './plazaFixtures'

describe('plazaPriceKind', () => {
  it('按 token 计费的模型（含按 token 计费的生图模型）归入 token', () => {
    expect(priceKind(tokenModel())).toBe('token')
    expect(priceKind(tokenModel({ name: 'gpt-image-2', image: { tiers: [] } }))).toBe('token')
    expect(imageTierPrices(tokenModel({ image: { tiers: [{ label: '1K', width: 1024, height: 1024 }] } }))).toEqual([])
  })

  it('各档价格不同为按分辨率，各档同价为按次', () => {
    expect(priceKind(imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1, '4K': 0.15 }))).toBe('resolution')
    const flat = imageModel('gpt-image-2', { '1K': 0.001, '2K': 0.001, '4K': 0.001 })
    expect(priceKind(flat)).toBe('request')
    expect(flatRequestPrice(flat)).toBe(0.001)
  })

  it('档位未单独定价时按计费回落到模型按次价，都没有的档不展示', () => {
    const m = imageModel('gpt-image-2', { '1K': 0.05 })
    m.pricing!.per_request_price = 0.08
    expect(imageTierPrices(m).map((t) => [t.label, t.price])).toEqual([
      ['1K', 0.05],
      ['2K', 0.08],
      ['4K', 0.08]
    ])
    expect(imageTierPrices(imageModel('gpt-image-2', { '2K': 0.1 })).map((t) => t.label)).toEqual(['2K'])
  })

  it('按次 / 按上下文分档的按次模型归入按次', () => {
    const perRequest = tokenModel({ name: 'sora', pricing: { ...tokenModel().pricing!, billing_mode: 'per_request', per_request_price: 0.2 } })
    expect(priceKind(perRequest)).toBe('request')
    expect(flatRequestPrice(perRequest)).toBe(0.2)
    const tiered = tokenModel({
      pricing: { ...tokenModel().pricing!, billing_mode: 'per_request', intervals: [interval({ max_tokens: 128000, per_request_price: 0.1 })] }
    })
    expect(flatRequestPrice(tiered)).toBeNull()
  })

  it('分组模型按 token → 按分辨率 → 按次分桶，空桶不返回', () => {
    const buckets = partitionByPriceKind([
      imageModel('a', { '1K': 0.001, '2K': 0.001 }),
      tokenModel(),
      imageModel('b', { '1K': 0.05, '2K': 0.1 })
    ])
    expect(buckets.map((b) => [b.kind, b.models.map((m) => m.name)])).toEqual([
      ['token', ['claude-sonnet']],
      ['resolution', ['b']],
      ['request', ['a']]
    ])
  })

  it('厂商按模型身份归类，NovelAI 按平台', () => {
    expect(vendorOf(tokenModel({ name: 'claude-opus-5', platform: 'antigravity' }))).toBe('claude')
    expect(vendorOf(tokenModel({ name: 'gpt-image-2', platform: 'openai' }))).toBe('openai')
    expect(vendorOf(tokenModel({ name: 'glm-5.3', platform: 'zhipu' }))).toBe('zhipu')
    expect(vendorOf(tokenModel({ name: 'nai-diffusion-5-full', platform: 'novelai' }))).toBe('novelai')
    expect(vendorOf(tokenModel({ name: 'mystery', platform: 'mistral' }))).toBe('mistral')
  })
})
