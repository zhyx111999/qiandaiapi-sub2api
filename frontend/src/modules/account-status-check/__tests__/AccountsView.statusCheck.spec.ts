import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { caps, statusItem } from './fixtures'

// 真实账号页接入独立状态列。
const mocks = vi.hoisted(() => ({ list: vi.fn(), statuses: vi.fn(), caps: vi.fn() }))
vi.mock('@/modules/account-status-check/capabilities', () => ({ loadAccountStatusCheckCapabilities: mocks.caps }))
vi.mock('@/modules/account-status-check/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAccountStatusChecks: mocks.statuses
}))
vi.mock('@/api/admin', () => ({
  adminAPI: {
    accounts: {
      getManagementCapabilities: vi.fn().mockResolvedValue({ web_search_enabled: false, account_quota_notify_enabled: false }),
      list: mocks.list,
      listWithEtag: vi.fn(),
      getUpstreamBillingRatesWithEtag: vi.fn(),
      getBatchTodayStats: vi.fn().mockResolvedValue({ stats: {} }),
      getUpstreamBillingProbeSettings: vi.fn().mockResolvedValue({ enabled: true, interval_minutes: 30 }),
      delete: vi.fn(), batchClearError: vi.fn(), batchRefresh: vi.fn(), toggleSchedulable: vi.fn()
    },
    proxies: { getAll: vi.fn().mockResolvedValue([]) },
    groups: { getAll: vi.fn().mockResolvedValue([]) }
  }
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token' }) }))
vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) }
})

import AccountsView from '@/views/admin/AccountsView.vue'

enableAutoUnmount(afterEach)

const DataTableStub = {
  props: ['data', 'loading'],
  template: `
    <div>
      <div v-for="row in loading ? [] : data" :key="row.id" :data-row="row.id">
        <slot name="cell-status" :row="row" />
        <slot name="cell-schedulable" :row="row" />
      </div>
    </div>
  `
}
const PaginationStub = { emits: ['update:page'], template: '<button data-test="next-page" @click="$emit(\'update:page\', 2)">next</button>' }

const account = (id: number, platform: string, type: string) => ({
  id, name: `account-${id}`, platform, type, status: 'active', schedulable: true, rate_multiplier: 1, extra: {},
  created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z'
})
const page = (items: ReturnType<typeof account>[], number = 1) => ({ items, total: 40, page: number, page_size: 20, pages: 2 })

function mountView() {
  return mount(AccountsView, {
    global: {
      stubs: {
        AppLayout: { template: '<div><slot /></div>' },
        TablePageLayout: { template: '<div><slot name="table" /><slot name="pagination" /></div>' },
        DataTable: DataTableStub, Pagination: PaginationStub,
        AccountStatusIndicator: { template: '<span data-test="official-status" />' },
        SchedulableTimerControl: true, AccountBulkActionsBar: true, AccountTableActions: true, AccountTableFilters: true,
        AccountActionMenu: true, ConfirmDialog: true, ImportDataModal: true, ReAuthAccountModal: true, AccountTestModal: true,
        AccountStatsModal: true, ScheduledTestsPanel: true, SyncFromCrsModal: true, TempUnschedStatusModal: true,
        ErrorPassthroughRulesModal: true, TLSFingerprintProfilesModal: true, CreateAccountModal: true, EditAccountModal: true,
        BulkEditAccountModal: true, PlatformTypeBadge: true, AccountCapacityCell: true, AccountTodayStatsCell: true,
        AccountGroupsCell: true, AccountUsageCell: true, Icon: true
      }
    }
  })
}

beforeEach(() => {
  localStorage.clear()
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.caps.mockResolvedValue(caps())
  mocks.statuses.mockImplementation(async (ids: number[]) => ids.map(account_id => statusItem({ account_id })))
  mocks.list.mockResolvedValue(page([account(1, 'openai', 'oauth'), account(2, 'openai', 'apikey'), account(3, 'anthropic', 'oauth'), account(5, 'openai', 'setup-token')]))
})

describe('账号列表状态检测接入', () => {
  it('OpenAI 所有类型共用一次批量状态查询', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(mocks.statuses).toHaveBeenCalledTimes(1)
    expect(mocks.statuses.mock.calls[0][0]).toEqual([1, 2, 5])
    const row = wrapper.get('[data-row="1"]')
    const official = row.get('[data-test="official-status"]').element
    const summary = row.get('[data-testid="account-status-check"]').element
    expect(official.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.find('button').exists()).toBe(true) // 调度开关仍留在原列
    expect(wrapper.get('[data-row="2"]').find('[data-testid="account-status-check"]').exists()).toBe(true)
    expect(wrapper.get('[data-row="5"]').find('[data-testid="account-status-check"]').exists()).toBe(true)
    expect(wrapper.get('[data-row="3"]').find('[data-testid="account-status-check"]').exists()).toBe(false)
  })

  it('新页取消旧批量查询并加载新页状态', async () => {
    mocks.statuses.mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()
    const firstSignal = mocks.statuses.mock.calls[0][1] as AbortSignal
    mocks.list.mockResolvedValue(page([account(4, 'openai', 'oauth')], 2))
    await wrapper.get('[data-test="next-page"]').trigger('click')
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    expect(mocks.statuses.mock.calls.map(call => call[0])).toEqual([[1, 2, 5], [4]])
    expect(wrapper.get('[data-row="4"]').find('[data-testid="account-status-check"]').exists()).toBe(true)
  })

  it('读不到能力时保持官方状态列且不显示检测状态', async () => {
    mocks.caps.mockResolvedValue(null)
    const wrapper = mountView()
    await flushPromises()
    expect(mocks.statuses).not.toHaveBeenCalled()
    expect(wrapper.get('[data-row="1"]').find('[data-test="official-status"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-status-check"]').exists()).toBe(false)
  })
})
