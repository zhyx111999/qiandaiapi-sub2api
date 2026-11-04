import { createI18n } from 'vue-i18n'
import zh from '../locales/zh'
import type { AccountStatusCheckCapabilities, AccountStatusCheckConfig, AccountStatusCheckStatusItem } from '../types'

export const caps = (): AccountStatusCheckCapabilities => ({
  defaults: { interval_minutes: 5, reasoning_effort: 'low', timeout_seconds: 600, disable_on_degraded: false, reopen_on_recovered: false },
  limits: { interval_min: 1, interval_max: 1440, timeout_min: 5, timeout_max: 600 },
  efforts: ['none', 'low', 'medium', 'high', 'xhigh']
})

export const config = (patch: Partial<AccountStatusCheckConfig> = {}): AccountStatusCheckConfig => ({
  account_id: 42, configured: true, enabled: true, check_enabled: true, interval_minutes: 2,
  model: 'gpt-6-astra', reasoning_effort: 'low', timeout_seconds: 600, disable_on_degraded: false, reopen_on_recovered: false, plan_id: 3,
  inherited_from_account_id: null, ...patch
})

export const statusItem = (patch: Partial<AccountStatusCheckStatusItem> = {}): AccountStatusCheckStatusItem => ({
  account_id: 42, enabled: true, state: 'normal',
  latest: { status: 'normal', matched: true, answer_hint: '21', latency_ms: 33800, started_at: '2026-10-30T02:46:01Z' },
  history: Array(15).fill('normal'), matched: 15, completed: 15, rate: 100,
  model: 'gpt-6-astra', reasoning_effort: 'low', interval_minutes: 2, check_enabled: true, inherited_from_account_id: null, ...patch
})

/** 用真实中文文案验证管理员可见结果。 */
export const zhI18n = () => createI18n({ legacy: false, locale: 'zh', messages: { zh: { accountStatusCheck: zh } } })

/** 一份完整的可保存设置。 */
export const defaultBody = { enabled: true, check_enabled: true, interval_minutes: 5, model: '', reasoning_effort: 'low', timeout_seconds: 600, disable_on_degraded: false, reopen_on_recovered: false }
