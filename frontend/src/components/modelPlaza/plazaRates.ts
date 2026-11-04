/** 模型广场的倍率与价格口径（实付 = 单价 × 生效倍率，与计费一致）。 */
import { BILLING_MODE_IMAGE, BILLING_MODE_VIDEO } from '@/constants/channel'
import { formatScaled } from '@/utils/pricing'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'

/** 价格口径：分组价格（实付）/ 官方价格（参考价，不乘倍率）。 */
export type PlazaPriceMode = 'group' | 'official'

export const PER_MILLION = 1_000_000

/** 价格统一保底 2 位小数，更长的有效小数原样保留。 */
const MIN_DECIMALS = 2

/** 生效倍率 = 用户专属倍率 ?? 分组默认倍率。 */
export function effectiveRate(g: ModelPlazaGroup): number {
  return g.user_rate_multiplier ?? g.rate_multiplier
}

export function hasCustomRate(g: ModelPlazaGroup): boolean {
  return g.user_rate_multiplier != null && g.user_rate_multiplier !== g.rate_multiplier
}

/** 图片 / 视频计费的模型可由分组独立倍率覆盖通用倍率。 */
export function usesIndependentMediaRate(g: ModelPlazaGroup, m: PlazaModel): boolean {
  const mode = m.pricing?.billing_mode
  return (mode === BILLING_MODE_IMAGE && g.image_rate_independent) || (mode === BILLING_MODE_VIDEO && g.video_rate_independent)
}

/** 非 token 计费行的生效倍率。 */
export function mediaRate(g: ModelPlazaGroup, m: PlazaModel): number {
  if (!usesIndependentMediaRate(g, m)) return effectiveRate(g)
  const independent = m.pricing?.billing_mode === BILLING_MODE_VIDEO ? g.video_rate_multiplier : g.image_rate_multiplier
  return Math.max(0, independent ?? 1)
}

/** “$3.00”；缺失为 “-”。scale 为 1M 时换算为每百万 token。 */
export function formatPrice(value: number | null | undefined, scale = 1): string {
  return value == null ? '-' : formatScaled(value, scale, MIN_DECIMALS)
}

/** 去掉浮点噪声的倍率乘积。 */
export function multiplyRate(a: number, b: number): number {
  return Math.round(a * b * 1000) / 1000
}
