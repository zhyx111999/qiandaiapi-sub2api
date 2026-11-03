import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { notifyAccountStatusCheckChanged, useAccountStatusChecks } from '../useAccountStatusChecks'
import { caps, statusItem } from './fixtures'

const mocks = vi.hoisted(() => ({ statuses: vi.fn(), caps: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), getAccountStatusChecks: mocks.statuses }))
vi.mock('../capabilities', () => ({ loadAccountStatusCheckCapabilities: mocks.caps }))

enableAutoUnmount(afterEach)

type Row = { id: number; platform: string; type: string; parent_account_id?: number | null }
const oauth = (id: number): Row => ({ id, platform: 'openai', type: 'oauth' })

function setup(initial: Row[], busy = false) {
  const rows = ref<Row[]>(initial)
  const loading = ref(busy)
  let api!: ReturnType<typeof useAccountStatusChecks>
  mount(defineComponent({ setup: () => { api = useAccountStatusChecks(rows, () => loading.value); return () => null } }))
  return { rows, loading, api: () => api }
}

const answer = (ids: readonly number[]) => ids.map(account_id => statusItem({ account_id }))
const requestedIds = () => mocks.statuses.mock.calls.map(call => call[0])
const signalOf = (call: number) => mocks.statuses.mock.calls[call][1] as AbortSignal

beforeEach(() => {
  mocks.statuses.mockReset().mockImplementation(async (ids: number[]) => answer(ids))
  mocks.caps.mockReset().mockResolvedValue(caps())
})

describe('OpenAI 状态检测批量查询', () => {
  it('当前页批量查询 OpenAI OAuth、API Key 和 setup-token', async () => {
    const { api } = setup([oauth(1), { id: 2, platform: 'openai', type: 'apikey' }, { id: 3, platform: 'anthropic', type: 'oauth' }, { ...oauth(4), type: 'setup-token' }])
    await flushPromises()
    expect(requestedIds()).toEqual([[1, 2, 4]])
    expect(api().statusFor(1)?.account_id).toBe(1)
    expect(api().statusFor(2)?.account_id).toBe(2)
  })

  it('没有 OpenAI 行时不发请求', async () => {
    setup([{ id: 2, platform: 'gemini', type: 'oauth' }])
    await flushPromises()
    expect(mocks.statuses).not.toHaveBeenCalled()
  })

  it('列表加载时取消旧请求并在新页加载后查询', async () => {
    let release!: () => void
    mocks.statuses.mockImplementationOnce((ids: number[]) => new Promise(resolve => { release = () => resolve(answer(ids)) }))
    const { rows, loading, api } = setup([oauth(1)])
    await flushPromises()
    loading.value = true
    await flushPromises()
    expect(signalOf(0).aborted).toBe(true)
    rows.value = [oauth(5), oauth(6)]
    await flushPromises()
    expect(mocks.statuses).toHaveBeenCalledTimes(1)
    loading.value = false
    await flushPromises()
    release()
    await flushPromises()
    expect(requestedIds()).toEqual([[1], [5, 6]])
    expect(api().statusFor(1)).toBeNull()
    expect(api().statusFor(5)?.account_id).toBe(5)
  })

  it('每次列表刷新都会更新状态，即使账号集合不变', async () => {
    const { loading } = setup([oauth(1)])
    await flushPromises()
    loading.value = true
    await flushPromises()
    loading.value = false
    await flushPromises()
    expect(requestedIds()).toEqual([[1], [1]])
  })

  it('行集合变化时取消过期请求', async () => {
    mocks.statuses.mockImplementationOnce(() => new Promise(() => {}))
    const { rows } = setup([oauth(1)])
    await flushPromises()
    rows.value = [oauth(2)]
    await flushPromises()
    expect(signalOf(0).aborted).toBe(true)
    expect(requestedIds()).toEqual([[1], [2]])
  })

  it('行字段变化但账号集合不变时不重复查询', async () => {
    const { rows } = setup([oauth(1)])
    await flushPromises()
    rows.value = [{ ...oauth(1) }]
    await flushPromises()
    expect(mocks.statuses).toHaveBeenCalledTimes(1)
  })

  it('按接口批量上限分段请求', async () => {
    setup(Array.from({ length: 450 }, (_, index) => oauth(index + 1)))
    await flushPromises()
    expect(requestedIds().map(ids => ids.length)).toEqual([200, 200, 50])
  })

  it('模块关闭时不请求状态接口', async () => {
    mocks.caps.mockResolvedValue(null)
    const { api } = setup([oauth(1)])
    await flushPromises()
    expect(mocks.statuses).not.toHaveBeenCalled()
    expect(api().statusFor(1)).toBeNull()
  })

  it('状态接口失败回退到未检测，不能保留旧正常结果', async () => {
    const { loading, api } = setup([oauth(1)])
    await flushPromises()
    expect(api().statusFor(1)).not.toBeNull()
    mocks.statuses.mockRejectedValueOnce(new Error('boom'))
    loading.value = true
    await flushPromises()
    loading.value = false
    await flushPromises()
    expect(api().statusFor(1)?.state).toBe('unknown')
    expect(api().statusFor(1)?.latest).toBeNull()
  })

  it('配置保存后刷新批量结果', async () => {
    setup([oauth(1)])
    await flushPromises()
    notifyAccountStatusCheckChanged()
    await flushPromises()
    expect(mocks.statuses).toHaveBeenCalledTimes(2)
  })

  it('缺失摘要保持灰色未知，不使用成功占位', async () => {
    mocks.statuses.mockResolvedValue([])
    const { api } = setup([oauth(1)])
    await flushPromises()
    expect(api().statusFor(1)).toMatchObject({ state: 'unknown', latest: null, history: [], rate: null })
  })

  it('母账号和多个影子只查询一次母账号结果', async () => {
    const { api } = setup([oauth(1), { ...oauth(2), parent_account_id: 1 }, { ...oauth(3), parent_account_id: 1 }])
    await flushPromises()
    expect(requestedIds()).toEqual([[1]])
    expect(api().statusFor(2)).toMatchObject({ account_id: 2, inherited_from_account_id: 1, state: 'normal' })
    expect(api().statusFor(3)?.history).toEqual(api().statusFor(1)?.history)
  })

  it('仅影子在当前页时仍批量读取母账号且跟随关系变化', async () => {
    const { api, rows } = setup([{ ...oauth(2), parent_account_id: 1 }])
    await flushPromises()
    expect(requestedIds()).toEqual([[1]])
    expect(api().statusFor(2)?.inherited_from_account_id).toBe(1)
    rows.value = [{ ...oauth(2), parent_account_id: 3 }]
    await flushPromises()
    expect(requestedIds()).toEqual([[1], [3]])
    expect(api().statusFor(2)?.inherited_from_account_id).toBe(3)
  })
})
