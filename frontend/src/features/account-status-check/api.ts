import { apiClient } from '@/api/client'
import type { AccountStatusCheckCapabilities, AccountStatusCheckConfig, AccountStatusCheckSettings, AccountStatusCheckStatusItem } from './types'

const BASE = '/admin/account-status-check'


export const ERROR_DISABLED = 'ACCOUNT_STATUS_CHECK_DISABLED'
export const ERROR_RUNNING = 'ACCOUNT_STATUS_CHECK_RUNNING'
export const ERROR_OPENAI_ONLY = 'ACCOUNT_STATUS_CHECK_OPENAI_ONLY'
export const ERROR_INHERITED = 'ACCOUNT_STATUS_CHECK_INHERITED'
export const ERROR_INVALID = 'ACCOUNT_STATUS_CHECK_INVALID'

export async function getCapabilities(): Promise<AccountStatusCheckCapabilities> {
  const { data } = await apiClient.get<AccountStatusCheckCapabilities>(`${BASE}/capabilities`)
  return data
}

export async function getAccountStatusCheck(accountId: number): Promise<AccountStatusCheckConfig> {
  const { data } = await apiClient.get<AccountStatusCheckConfig>(`${BASE}/accounts/${accountId}`)
  return data
}

export async function updateAccountStatusCheck(accountId: number, settings: AccountStatusCheckSettings): Promise<AccountStatusCheckConfig> {
  const { data } = await apiClient.put<AccountStatusCheckConfig>(`${BASE}/accounts/${accountId}`, settings)
  return data
}

export async function getAccountStatusChecks(accountIds: readonly number[], signal?: AbortSignal): Promise<AccountStatusCheckStatusItem[]> {
  const { data } = await apiClient.get<{ items: AccountStatusCheckStatusItem[] }>(`${BASE}/status`, {
    params: { account_ids: accountIds.join(',') },
    signal
  })
  return data?.items ?? []
}

export async function runAccountStatusCheck(accountId: number): Promise<{ started: boolean }> {
  const { data } = await apiClient.post<{ started: boolean }>(`${BASE}/accounts/${accountId}/run`)
  return data
}
