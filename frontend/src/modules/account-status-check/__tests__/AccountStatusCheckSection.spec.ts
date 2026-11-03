import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import Toggle from '@/components/common/Toggle.vue'
import AccountStatusCheckSection from '../AccountStatusCheckSection.vue'
import { useAccountStatusCheckForm, type AccountStatusCheckForm } from '../useAccountStatusCheckForm'
import { caps, config, zhI18n } from './fixtures'

const mocks = vi.hoisted(() => ({
  caps: vi.fn(), get: vi.fn(), put: vi.fn(), run: vi.fn(), changed: vi.fn(), showError: vi.fn(), showSuccess: vi.fn()
}))
const auth = vi.hoisted(() => ({ isObserver: false }))
vi.mock('../capabilities', () => ({ loadAccountStatusCheckCapabilities: mocks.caps }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAccountStatusCheck: mocks.get,
  updateAccountStatusCheck: mocks.put,
  runAccountStatusCheck: mocks.run
}))
vi.mock('../useAccountStatusChecks', () => ({ notifyAccountStatusCheckChanged: mocks.changed }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

enableAutoUnmount(afterEach)

const Host = defineComponent({
  props: {
    platform: { type: String, default: 'openai' }, type: { type: String, default: 'oauth' },
    accountId: { type: Number, default: undefined }, parentId: { type: Number, default: undefined }, show: { type: Boolean, default: true }
  },
  setup(props, { expose }) {
    const source = { open: () => props.show, platform: () => props.platform, parentAccountId: () => props.parentId,
      ...(props.accountId === undefined ? {} : { accountId: () => props.accountId }) }
    const form = useAccountStatusCheckForm(source)
    expose({ form })
    return () => h(AccountStatusCheckSection)
  }
})

async function mountHost(props: Record<string, unknown> = {}) {
  const wrapper = mount(Host, { props, global: { plugins: [zhI18n()], stubs: { Toggle } } })
  await flushPromises()
  return wrapper
}
const formOf = (wrapper: Awaited<ReturnType<typeof mountHost>>) => (wrapper.vm as unknown as { form: AccountStatusCheckForm }).form
const section = '[data-testid="account-status-check-section"]'
const toggle = '[data-testid="account-status-check-toggle"]'
const checkToggle = '[data-testid="account-status-check-check-toggle"]'
const savedAccount = (id = 42) => ({ id, platform: 'openai', type: 'apikey', proxy_id: null }) as any

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  auth.isObserver = false
  mocks.caps.mockResolvedValue(caps())
  mocks.get.mockResolvedValue(config())
  mocks.put.mockImplementation(async (id: number, body: object) => config({ account_id: id, ...body }))
  mocks.run.mockResolvedValue({ started: true })
})

describe('状态检测独立编辑区', () => {
  it.each(['oauth', 'apikey', 'setup-token'])('OpenAI %s 均可读取状态配置', async type => {
    const wrapper = await mountHost({ type, accountId: 42 })
    expect(wrapper.find(section).exists()).toBe(true)
    expect(mocks.get).toHaveBeenCalledWith(42)
    expect(wrapper.get('[data-testid="account-status-check-model"]').attributes('placeholder')).toBe('gpt-6-astra')
  })

  it('非 OpenAI 隐藏且不读取状态接口', async () => {
    const wrapper = await mountHost({ platform: 'anthropic', accountId: 42 })
    expect(wrapper.find(section).exists()).toBe(false)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('读取失败时不展示配置并保留明确错误', async () => {
    mocks.get.mockRejectedValue({ message: 'database down' })
    const wrapper = await mountHost({ accountId: 42 })
    expect(wrapper.get('[data-testid="account-status-check-load-error"]').text()).toContain('database down')
    expect(wrapper.find(toggle).exists()).toBe(false)
  })

  it('读不到能力时隐藏该模块', async () => {
    mocks.caps.mockResolvedValue(null)
    const wrapper = await mountHost({ accountId: 42 })
    expect(wrapper.find(section).exists()).toBe(false)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('仅提交状态模块字段，开关与自动检测彼此独立', async () => {
    const wrapper = await mountHost({ accountId: 42 })
    await wrapper.get(checkToggle).trigger('click')
    await wrapper.get('[data-testid="account-status-check-interval"]').setValue('10')
    await formOf(wrapper).saveEdited(savedAccount())
    expect(mocks.put).toHaveBeenCalledWith(42, {
      enabled: true, check_enabled: false, interval_minutes: 10, model: 'gpt-6-astra', reasoning_effort: 'low', timeout_seconds: 600,
      disable_on_degraded: false
    })
    expect(mocks.changed).toHaveBeenCalledTimes(1)
  })

  it('降智关闭调度默认关闭，随自动检测显示并单独提交', async () => {
    const closeToggle = '[data-testid="account-status-check-disable-on-degraded"]'
    const wrapper = await mountHost({ accountId: 42 })
    expect(wrapper.text()).toContain('降智时关闭调度')
    await wrapper.get(closeToggle).trigger('click')
    await formOf(wrapper).saveEdited(savedAccount())
    expect(mocks.put).toHaveBeenCalledWith(42, expect.objectContaining({ check_enabled: true, disable_on_degraded: true }))

    mocks.get.mockResolvedValue(config({ check_enabled: false }))
    const manual = await mountHost({ accountId: 42 })
    expect(manual.find(closeToggle).exists()).toBe(false)
  })

  it('模块主开关可独立关闭并手动立即检测', async () => {
    const wrapper = await mountHost({ accountId: 42 })
    await wrapper.get(toggle).trigger('click')
    await formOf(wrapper).saveEdited(savedAccount())
    expect(mocks.put).toHaveBeenCalledWith(42, expect.objectContaining({ enabled: false }))

    mocks.get.mockResolvedValue(config())
    const reopened = await mountHost({ accountId: 42 })
    await reopened.get('[data-testid="account-status-check-run"]').trigger('click')
    await flushPromises()
    expect(mocks.run).toHaveBeenCalledWith(42)
    expect(mocks.changed).toHaveBeenCalledTimes(2)
  })

  it('没有可用文本模型时说明原因，不提供无效的立即检测', async () => {
    mocks.get.mockResolvedValue(config({ model: '', effective_model: '', plan_id: null }))
    const wrapper = await mountHost({ accountId: 42 })
    expect(wrapper.get('[data-testid="account-status-check-no-model"]').text()).toContain('可用的文本模型')
    expect(wrapper.find('[data-testid="account-status-check-run"]').exists()).toBe(false)
    await formOf(wrapper).runNow()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('影子账号显示只读继承说明，不提交或手动运行', async () => {
    mocks.get.mockResolvedValue(config({ inherited_from_account_id: 7 }))
    const wrapper = await mountHost({ accountId: 42, parentId: 7 })
    expect(wrapper.get('[data-testid="account-status-check-inherited"]').text()).toContain('只读继承母账号')
    await wrapper.get(toggle).trigger('click')
    await formOf(wrapper).saveEdited(savedAccount())
    await formOf(wrapper).runNow()
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('不覆盖其他账号的编辑上下文', async () => {
    const wrapper = await mountHost({ accountId: 42 })
    await expect(formOf(wrapper).saveEdited(savedAccount(43))).resolves.toMatchObject({ id: 43 })
    expect(mocks.put).not.toHaveBeenCalled()
  })
})
