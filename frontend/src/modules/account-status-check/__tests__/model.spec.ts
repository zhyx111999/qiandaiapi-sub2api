import { describe, expect, it } from 'vitest'
import { appliesToAccount, defaultSettings, normalizeSettings, statusCheckErrorMessage, sameSettings, settingsFromConfig } from '../model'
import { caps, config, defaultBody } from './fixtures'

const t = (key: string) => key

describe('状态检测配置模型', () => {
  it('全部 OpenAI 类型适用，非 OpenAI 不适用', () => {
    expect(appliesToAccount('openai')).toBe(true)
    for (const platform of ['anthropic', 'gemini', 'antigravity', 'grok', undefined]) expect(appliesToAccount(platform)).toBe(false)
  })

  it('新账号使用服务端默认的开启状态、模型留空与 600 秒超时', () => {
    expect(defaultSettings(caps())).toEqual(defaultBody)
  })

  it('读取已有配置并让缺失配置保持默认开启', () => {
    expect(settingsFromConfig(config({ enabled: false }), caps())).toMatchObject({ enabled: false, interval_minutes: 2 })
    expect(settingsFromConfig(config({ configured: false, enabled: false, interval_minutes: 5 }), caps())).toMatchObject({ enabled: true, interval_minutes: 5 })
  })

  it('数值和推理强度遵循服务端范围', () => {
    const limits = caps()
    expect(normalizeSettings({ ...defaultBody, interval_minutes: 5000, timeout_seconds: 1, model: '  gpt-x ', reasoning_effort: 'turbo' }, limits))
      .toEqual({ ...defaultBody, interval_minutes: 1440, timeout_seconds: 5, model: 'gpt-x', reasoning_effort: 'low' })
    expect(normalizeSettings({ ...defaultBody, interval_minutes: 2.6, timeout_seconds: '' as unknown as number }, limits))
      .toMatchObject({ interval_minutes: 3, timeout_seconds: 600 })
    expect(normalizeSettings({ ...defaultBody, timeout_seconds: 900 }, limits).timeout_seconds).toBe(600)
  })

  it('比较全部可保存字段', () => {
    expect(sameSettings(defaultBody, { ...defaultBody })).toBe(true)
    for (const patch of [{ enabled: false }, { check_enabled: false }, { interval_minutes: 6 }, { model: 'account-model' }, { reasoning_effort: 'high' }, { timeout_seconds: 60 }, { disable_on_degraded: true }]) {
      expect(sameSettings(defaultBody, { ...defaultBody, ...patch })).toBe(false)
    }
  })

  it('错误码保持可读', () => {
    for (const [code, key] of [['DISABLED', 'disabled'], ['RUNNING', 'running'], ['OPENAI_ONLY', 'openaiOnly'], ['INHERITED', 'inherited'], ['INVALID', 'invalid']]) {
      expect(statusCheckErrorMessage({ reason: `ACCOUNT_STATUS_CHECK_${code}` }, t)).toBe(`accountStatusCheck.errors.${key}`)
    }
    expect(statusCheckErrorMessage({ message: '服务端错误' }, t)).toBe('服务端错误')
    expect(statusCheckErrorMessage({}, t)).toBe('accountStatusCheck.errors.unknown')
  })
})
