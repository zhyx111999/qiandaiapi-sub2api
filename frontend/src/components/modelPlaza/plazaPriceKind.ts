/**
 * 定价方式自动匹配：每个模型按实际计费方式归入一种展示方式，分组内同一方式的模型共用一张表、
 * 一套列。
 * - token：按 token 计费（输入 / 输出 / 缓存）；
 * - resolution：按分辨率计费——生图模型各档（1K/2K/4K 附档位分辨率，NovelAI 像素档附像素范围）价格不同；
 * - request：按次计费——按次 / 按视频模型，以及各档同价的生图模型。
 */
import { BILLING_MODE_TOKEN } from '@/constants/channel'
import type { UserPricingInterval } from '@/api/channels'
import type { PlazaImageTier, PlazaModel } from '@/api/modelPlaza'

export type PlazaPriceKind = 'token' | 'resolution' | 'request'

export const PLAZA_PRICE_KINDS: PlazaPriceKind[] = ['token', 'resolution', 'request']

/** 生图档位及其单价（未乘倍率）。 */
export interface PlazaTierPrice extends PlazaImageTier {
  price: number
}

function isTokenBilled(m: PlazaModel): boolean {
  return (m.pricing?.billing_mode || BILLING_MODE_TOKEN) === BILLING_MODE_TOKEN
}

/** 配了按次价的区间（生图档位或按上下文分档）。 */
export function requestIntervals(m: PlazaModel): UserPricingInterval[] {
  return (m.pricing?.intervals ?? []).filter((iv) => iv.per_request_price != null)
}

/** 价卡档位是否就是该展示档位：NovelAI 像素档按像素范围对应，其余按档位名对应。 */
function sameTier(iv: UserPricingInterval, tier: PlazaImageTier): boolean {
  if (tier.min_pixels != null || tier.max_pixels != null) {
    return iv.min_tokens === (tier.min_pixels ?? 0) && (iv.max_tokens ?? undefined) === tier.max_pixels
  }
  return iv.tier_label?.toUpperCase() === tier.label.toUpperCase()
}

/**
 * 生图模型各档单价：取对应档位的价，档位未单独定价时按计费回落到模型按次价；
 * 两者都没有的档不展示。非生图或按 token 计费的模型为空。
 */
export function imageTierPrices(m: PlazaModel): PlazaTierPrice[] {
  if (!m.image || isTokenBilled(m)) return []
  const intervals = requestIntervals(m)
  return m.image.tiers.flatMap((tier) => {
    const iv = intervals.find((i) => sameTier(i, tier))
    const price = iv?.per_request_price ?? m.pricing?.per_request_price
    return price == null ? [] : [{ ...tier, price }]
  })
}

export function priceKind(m: PlazaModel): PlazaPriceKind {
  if (isTokenBilled(m)) return 'token'
  const tiers = imageTierPrices(m)
  return new Set(tiers.map((t) => t.price)).size > 1 ? 'resolution' : 'request'
}

/** 按次单价：各档同价的生图模型取该价，否则取模型按次价（按上下文分档时为空，见 requestIntervals）。 */
export function flatRequestPrice(m: PlazaModel): number | null {
  const tiers = imageTierPrices(m)
  if (tiers.length) return tiers[0].price
  if (requestIntervals(m).length) return null
  return m.pricing?.per_request_price ?? null
}

/** 分组模型按展示方式分桶（保持原顺序），空桶不返回。 */
export function partitionByPriceKind(models: PlazaModel[]): { kind: PlazaPriceKind; models: PlazaModel[] }[] {
  return PLAZA_PRICE_KINDS.map((kind) => ({ kind, models: models.filter((m) => priceKind(m) === kind) })).filter(
    (bucket) => bucket.models.length > 0
  )
}

/**
 * 档位覆盖范围：分辨率档为“1024×1024”；NovelAI 像素档为“≤1,048,576”“1,048,577–1,572,864”
 * “≥2,621,441”，后接像素单位。
 */
export function formatTierSpan(tier: PlazaImageTier, pixelUnit: string): string {
  if (tier.min_pixels == null && tier.max_pixels == null) return `${tier.width}×${tier.height}`
  const n = (v: number) => v.toLocaleString('en-US')
  const span = !tier.min_pixels
    ? `≤${n(tier.max_pixels!)}`
    : tier.max_pixels == null
      ? `≥${n(tier.min_pixels)}`
      : `${n(tier.min_pixels)}–${n(tier.max_pixels)}`
  return `${span} ${pixelUnit}`
}

/**
 * 上下文档位标签：优先管理员给出的 tier_label，否则有上限为「≤上限」、末档为「>下限」；
 * 档位升序排列，相邻的 ≤100K / ≤200K 即表示 (100K,200K]。
 */
export function contextTierLabel(iv: UserPricingInterval): string {
  if (iv.tier_label) return iv.tier_label
  return iv.max_tokens == null ? `>${formatTokenCount(iv.min_tokens)}` : `≤${formatTokenCount(iv.max_tokens)}`
}

function formatTokenCount(n: number): string {
  const trim = (v: number) => String(Math.round(v * 100) / 100)
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}K`
  return String(n)
}
