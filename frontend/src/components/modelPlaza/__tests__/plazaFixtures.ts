import type { ModelPlazaGroup, PlazaImageTier, PlazaModel } from '@/api/modelPlaza'
import type { UserPricingInterval } from '@/api/channels'

export function plazaGroup(overrides: Partial<ModelPlazaGroup> = {}): ModelPlazaGroup {
  return {
    id: 1,
    name: 'g',
    description: '',
    platform: 'openai',
    subscription_type: 'standard',
    rate_multiplier: 1,
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    is_exclusive: false,
    image_rate_independent: false,
    image_rate_multiplier: 1,
    video_rate_independent: false,
    video_rate_multiplier: 1,
    long_context_pricing_enabled: true,
    models: [],
    ...overrides
  }
}

export function tokenModel(overrides: Partial<PlazaModel> = {}): PlazaModel {
  return {
    name: 'claude-sonnet',
    platform: 'anthropic',
    pricing: {
      billing_mode: 'token',
      input_price: 3e-6,
      output_price: 1.5e-5,
      cache_write_price: 3.75e-6,
      cache_read_price: 3e-7,
      image_input_price: null,
      image_output_price: null,
      per_request_price: null,
      intervals: []
    },
    official_pricing: {
      input_price: 3e-6,
      output_price: 1.5e-5,
      cache_write_price: 3.75e-6,
      cache_write_1h_price: 6e-6,
      cache_read_price: 3e-7
    },
    ...overrides
  }
}

export function interval(overrides: Partial<UserPricingInterval> = {}): UserPricingInterval {
  return {
    min_tokens: 0,
    max_tokens: null,
    input_price: null,
    output_price: null,
    cache_write_price: null,
    cache_read_price: null,
    per_request_price: null,
    ...overrides
  }
}

const EDGE_TIERS: PlazaImageTier[] = [
  { label: '1K', width: 1024, height: 1024 },
  { label: '2K', width: 2048, height: 2048 },
  { label: '4K', width: 4096, height: 4096 }
]

/** 按张计费的生图模型；prices 为各档单价（缺省的档不配区间）。 */
export function imageModel(
  name: string,
  prices: Record<string, number>,
  overrides: Partial<PlazaModel> = {},
  tiers: PlazaImageTier[] = EDGE_TIERS
): PlazaModel {
  return {
    name,
    platform: 'openai',
    pricing: {
      billing_mode: 'image',
      input_price: null,
      output_price: null,
      cache_write_price: null,
      cache_read_price: null,
      image_input_price: null,
      image_output_price: null,
      per_request_price: null,
      intervals: Object.entries(prices).map(([label, price]) => interval({ tier_label: label, per_request_price: price }))
    },
    official_pricing: null,
    image: { tiers },
    ...overrides
  }
}

export const NOVELAI_TIERS: PlazaImageTier[] = [
  { label: '1K', width: 1024, height: 1024 },
  { label: '2K', width: 1536, height: 2048 }
]

/** NovelAI 像素档（她的渠道配置）：1MP / 1.5MP / 2MP / 2.5MP / 3MP。 */
export const NOVELAI_PIXEL_TIERS: PlazaImageTier[] = [
  { label: '1MP', max_pixels: 1048576 },
  { label: '1.5MP', min_pixels: 1048577, max_pixels: 1572864 },
  { label: '2MP', min_pixels: 1572865, max_pixels: 2097152 },
  { label: '2.5MP', min_pixels: 2097153, max_pixels: 2621440 },
  { label: '3MP', min_pixels: 2621441 }
]

/** 按像素档计费的 NovelAI 模型：价卡区间的范围与展示档位一致。 */
export function novelAIPixelModel(prices: number[], name = 'nai-diffusion-5-full'): PlazaModel {
  const m = imageModel(name, {}, { platform: 'novelai' }, NOVELAI_PIXEL_TIERS)
  m.pricing!.per_request_price = prices[0]
  m.pricing!.intervals = NOVELAI_PIXEL_TIERS.map((tier, i) =>
    interval({ tier_label: tier.label, min_tokens: tier.min_pixels ?? 0, max_tokens: tier.max_pixels ?? null, per_request_price: prices[i] })
  )
  m.image!.reference_image_price = 0.075
  return m
}
