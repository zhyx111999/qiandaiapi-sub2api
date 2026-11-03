import { extractApiErrorCode, extractApiErrorMessage } from '@/utils/apiError'
import { ERROR_DISABLED, ERROR_INHERITED, ERROR_INVALID, ERROR_OPENAI_ONLY, ERROR_RUNNING } from './api'
import type { AccountStatusCheckCapabilities, AccountStatusCheckConfig, AccountStatusCheckSettings } from './types'

/** 状态检测适用于全部 OpenAI 凭据类型。 */
export function appliesToAccount(platform: string | null | undefined): boolean {
  return platform === 'openai'
}

export function defaultSettings(caps: AccountStatusCheckCapabilities): AccountStatusCheckSettings {
  return {
    enabled: true,
    check_enabled: true,
    interval_minutes: caps.defaults.interval_minutes,
    model: '',
    reasoning_effort: caps.defaults.reasoning_effort,
    timeout_seconds: caps.defaults.timeout_seconds,
    disable_on_degraded: caps.defaults.disable_on_degraded,
    reopen_on_recovered: caps.defaults.reopen_on_recovered
  }
}

export function settingsFromConfig(config: AccountStatusCheckConfig, caps: AccountStatusCheckCapabilities): AccountStatusCheckSettings {
  return normalizeSettings({
    enabled: config.configured === false ? true : config.enabled === true,
    check_enabled: config.configured === false || config.check_enabled !== false,
    interval_minutes: config.interval_minutes,
    model: typeof config.model === 'string' ? config.model : '',
    reasoning_effort: config.reasoning_effort,
    timeout_seconds: config.timeout_seconds,
    disable_on_degraded: config.disable_on_degraded === true,
    reopen_on_recovered: config.reopen_on_recovered === true
  }, caps)
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

export function normalizeSettings(settings: AccountStatusCheckSettings, caps: AccountStatusCheckCapabilities): AccountStatusCheckSettings {
  const { limits, defaults, efforts } = caps
  return {
    enabled: settings.enabled === true,
    check_enabled: settings.check_enabled === true,
    interval_minutes: clampInt(settings.interval_minutes, limits.interval_min, limits.interval_max, defaults.interval_minutes),
    model: String(settings.model ?? '').trim(),
    reasoning_effort: efforts.includes(settings.reasoning_effort) ? settings.reasoning_effort : defaults.reasoning_effort,
    timeout_seconds: clampInt(settings.timeout_seconds, limits.timeout_min, limits.timeout_max, defaults.timeout_seconds),
    disable_on_degraded: settings.disable_on_degraded === true,
    reopen_on_recovered: settings.reopen_on_recovered === true
  }
}

export function sameSettings(left: AccountStatusCheckSettings, right: AccountStatusCheckSettings): boolean {
  return left.enabled === right.enabled && left.check_enabled === right.check_enabled &&
    left.interval_minutes === right.interval_minutes && left.model === right.model &&
    left.reasoning_effort === right.reasoning_effort && left.timeout_seconds === right.timeout_seconds &&
    left.disable_on_degraded === right.disable_on_degraded && left.reopen_on_recovered === right.reopen_on_recovered
}

type Translate = (key: string, params?: Record<string, unknown>) => string

export function statusCheckErrorMessage(error: unknown, t: Translate): string {
  const code = extractApiErrorCode(error)
  if (code === ERROR_DISABLED) return t('accountStatusCheck.errors.disabled')
  if (code === ERROR_RUNNING) return t('accountStatusCheck.errors.running')
  if (code === ERROR_OPENAI_ONLY) return t('accountStatusCheck.errors.openaiOnly')
  if (code === ERROR_INHERITED) return t('accountStatusCheck.errors.inherited')
  if (code === ERROR_INVALID) return t('accountStatusCheck.errors.invalid')
  return extractApiErrorMessage(error, t('accountStatusCheck.errors.unknown'))
}
