import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client', () => ({ apiClient: client }))

describe('状态检测 HTTP 合同', () => {
  beforeEach(() => Object.values(client).forEach(mock => mock.mockReset()))

  it('使用独立 capabilities、状态批量、配置及立即运行路径', async () => {
    client.get.mockResolvedValue({ data: { enabled: true } })
    client.put.mockResolvedValue({ data: { account_id: 9, model: 'gpt-6.1-sol' } })
    client.post.mockResolvedValue({ data: { started: true } })
    vi.resetModules()
    const api = await import('../api')
    await api.getCapabilities()
    expect(client.get).toHaveBeenLastCalledWith('/admin/account-status-check/capabilities')
    await api.getAccountStatusChecks([9, 10])
    expect(client.get).toHaveBeenLastCalledWith('/admin/account-status-check/status', {
      params: { account_ids: '9,10' }, signal: undefined
    })
    const settings = { enabled: true, check_enabled: false, interval_minutes: 5, model: '', reasoning_effort: 'low', timeout_seconds: 600 }
    await api.updateAccountStatusCheck(9, settings)
    expect(client.put).toHaveBeenLastCalledWith('/admin/account-status-check/accounts/9', settings)
    await api.runAccountStatusCheck(9)
    expect(client.post).toHaveBeenLastCalledWith('/admin/account-status-check/accounts/9/run')
  })
})
