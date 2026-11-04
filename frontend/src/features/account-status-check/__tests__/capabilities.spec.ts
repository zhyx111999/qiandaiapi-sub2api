import { beforeEach, describe, expect, it, vi } from 'vitest'
import { caps } from './fixtures'

const getCapabilities = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ getCapabilities }))

async function load() {
  vi.resetModules()
  return (await import('../capabilities')).loadAccountStatusCheckCapabilities
}

beforeEach(() => getCapabilities.mockReset())

describe('状态检测能力', () => {
  it('共享读取结果，并保留官方 600 秒上限', async () => {
    getCapabilities.mockResolvedValue(caps())
    const loadCaps = await load()
    await expect(loadCaps()).resolves.toEqual(caps())
    await expect(loadCaps()).resolves.toEqual(caps())
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    expect((await loadCaps())?.defaults.timeout_seconds).toBe(600)
    expect((await loadCaps())?.limits.timeout_max).toBe(600)
  })

  it('响应不完整时返回 null 并共享该结果', async () => {
    getCapabilities.mockResolvedValue({ defaults: caps().defaults })
    const loadCaps = await load()
    await expect(loadCaps()).resolves.toBeNull()
    await expect(loadCaps()).resolves.toBeNull()
    expect(getCapabilities).toHaveBeenCalledTimes(1)
  })

  it('请求失败后允许下一次重试', async () => {
    getCapabilities.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce(caps())
    const loadCaps = await load()
    await expect(loadCaps()).resolves.toBeNull()
    await expect(loadCaps()).resolves.toEqual(caps())
    expect(getCapabilities).toHaveBeenCalledTimes(2)
  })

  it('拒绝无效能力响应', async () => {
    const broken = [
      { ...caps(), efforts: [] },
      { ...caps(), limits: { interval_min: 10, interval_max: 1, timeout_min: 5, timeout_max: 600 } },
      { ...caps(), defaults: { ...caps().defaults, interval_minutes: 0 } },
      { ...caps(), limits: undefined }
    ]
    for (const answer of broken) {
      getCapabilities.mockResolvedValueOnce(answer)
      await expect((await load())()).resolves.toBeNull()
    }
  })

  it('默认推理强度不可用时回退到第一个支持项', async () => {
    getCapabilities.mockResolvedValue({ ...caps(), defaults: { ...caps().defaults, reasoning_effort: 'turbo' } })
    expect((await (await load())())?.defaults.reasoning_effort).toBe('none')
  })
})
