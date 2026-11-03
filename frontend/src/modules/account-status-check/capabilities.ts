import { getCapabilities } from './api'
import type { AccountStatusCheckCapabilities } from './types'

let cached: Promise<AccountStatusCheckCapabilities | null> | null = null

/** 响应异常或请求失败时返回 null；失败请求允许后续重试。 */
export function loadAccountStatusCheckCapabilities(): Promise<AccountStatusCheckCapabilities | null> {
  if (cached) return cached
  const pending = getCapabilities().then(normalizeCapabilities, () => {
    if (cached === pending) cached = null
    return null
  })
  cached = pending
  return pending
}

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

function normalizeCapabilities(raw: unknown): AccountStatusCheckCapabilities | null {
  const caps = raw as Partial<AccountStatusCheckCapabilities> | null | undefined
  if (!caps) return null
  const { defaults, limits } = caps
  const efforts = Array.isArray(caps.efforts) ? caps.efforts.filter((effort): effort is string => typeof effort === 'string' && effort !== '') : []
  if (!defaults || !limits || efforts.length === 0) return null
  const { interval_min, interval_max, timeout_min, timeout_max } = limits
  if (!isInt(interval_min) || !isInt(interval_max) || !isInt(timeout_min) || !isInt(timeout_max)) return null
  if (interval_min < 1 || interval_min > interval_max || timeout_min < 1 || timeout_min > timeout_max) return null
  const within = (value: unknown, min: number, max: number) => isInt(value) && value >= min && value <= max
  if (!within(defaults.interval_minutes, interval_min, interval_max) || !within(defaults.timeout_seconds, timeout_min, timeout_max)) return null
  const models = defaults.models && typeof defaults.models === 'object' ? defaults.models : {}
  return {
    defaults: {
      interval_minutes: defaults.interval_minutes,
      timeout_seconds: defaults.timeout_seconds,
      disable_on_degraded: defaults.disable_on_degraded === true,
      reopen_on_recovered: defaults.reopen_on_recovered === true,
      reasoning_effort: efforts.includes(defaults.reasoning_effort) ? defaults.reasoning_effort : efforts[0],
      models: Object.fromEntries(Object.entries(models).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    },
    limits: { interval_min, interval_max, timeout_min, timeout_max },
    efforts
  }
}
