import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DailyCheckinCard from '../DailyCheckinCard.vue'
import type { CheckinStatus } from '@/api/checkin'

const { getStatus, checkIn, updateSettings, showSuccess, showError, refreshUser } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  checkIn: vi.fn(),
  updateSettings: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  refreshUser: vi.fn()
}))

vi.mock('@/api/checkin', () => ({ checkinAPI: { getStatus, checkIn, updateSettings } }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showSuccess, showError }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ refreshUser }) }))
vi.mock('@/utils/format', () => ({ formatCurrency: (amount?: number) => `$${(amount ?? 0).toFixed(2)}` }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

enableAutoUnmount(afterEach)

const baseStatus: CheckinStatus = {
  enabled: true,
  reward_min: 3,
  reward_max: 5,
  checked_in: false,
  next_reset_at: '2026-10-28T00:00:00Z',
  is_admin: false
}

describe('DailyCheckinCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    refreshUser.mockResolvedValue({})
  })

  it('stays hidden when the check-in service is unavailable', async () => {
    getStatus.mockRejectedValue(new Error('502'))
    const wrapper = mount(DailyCheckinCard)
    await flushPromises()
    expect(wrapper.find('[data-testid="daily-checkin-card"]').exists()).toBe(false)
  })

  it('checks in once and refreshes the balance', async () => {
    getStatus
      .mockResolvedValueOnce(baseStatus)
      .mockResolvedValueOnce({ ...baseStatus, checked_in: true, reward_amount: 3.42 })
    checkIn.mockResolvedValue({ reward_amount: 3.42, new_balance: 13.42, next_reset_at: baseStatus.next_reset_at })
    const wrapper = mount(DailyCheckinCard)
    await flushPromises()

    const button = wrapper.get('[data-testid="daily-checkin-button"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()

    expect(checkIn).toHaveBeenCalledTimes(1)
    expect(showSuccess).toHaveBeenCalledWith('checkin.success')
    expect(refreshUser).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="daily-checkin-button"]').attributes('disabled')).toBeDefined()
  })

  it('shows the settings panel to administrators only', async () => {
    getStatus.mockResolvedValue(baseStatus)
    const userCard = mount(DailyCheckinCard)
    await flushPromises()
    expect(userCard.find('[data-testid="daily-checkin-admin"]').exists()).toBe(false)

    getStatus.mockResolvedValue({ ...baseStatus, is_admin: true })
    const adminCard = mount(DailyCheckinCard)
    await flushPromises()
    expect(adminCard.find('[data-testid="daily-checkin-admin"]').exists()).toBe(true)
  })

  it('saves the site-wide range and blocks an inverted one', async () => {
    getStatus.mockResolvedValue({ ...baseStatus, enabled: false, is_admin: true })
    updateSettings.mockResolvedValue({ enabled: true, reward_min: 3, reward_max: 5 })
    const wrapper = mount(DailyCheckinCard)
    await flushPromises()

    await wrapper.get('#daily-checkin-min').setValue('6')
    expect(wrapper.get('[data-testid="daily-checkin-save"]').attributes('disabled')).toBeDefined()

    await wrapper.get('#daily-checkin-min').setValue('3')
    await wrapper.get('[data-testid="daily-checkin-enabled"]').setValue(true)
    await wrapper.get('[data-testid="daily-checkin-save"]').trigger('click')
    await flushPromises()
    expect(updateSettings).toHaveBeenCalledWith({ enabled: true, reward_min: 3, reward_max: 5 })
    expect(showSuccess).toHaveBeenCalledWith('common.saved')
  })
})
