import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { getAccountStatusChecks, STATUS_BATCH_LIMIT } from './api'
import { loadAccountStatusCheckCapabilities } from './capabilities'
import { appliesToAccount } from './model'
import type { AccountStatusCheckCapabilities, AccountStatusCheckStatusItem } from './types'

const revision = ref(0)

export function notifyAccountStatusCheckChanged(): void {
  revision.value += 1
}

interface AccountRow {
  id: number
  platform?: string | null
  type?: string | null
  parent_account_id?: number | null
}

function unknownStatus(accountId: number): AccountStatusCheckStatusItem {
  return {
    account_id: accountId,
    enabled: true,
    state: 'unknown',
    latest: null,
    history: [],
    matched: 0,
    completed: 0,
    rate: null,
    model: '',
    reasoning_effort: '',
    interval_minutes: 0,
    check_enabled: true,
    inherited_from_account_id: null
  }
}

/** 当前页按母账号去重后批量读取；不为行项目建立独立轮询。 */
export function useAccountStatusChecks(rows: Ref<readonly AccountRow[]>, busy: () => boolean) {
  const items = shallowRef<ReadonlyMap<number, AccountStatusCheckStatusItem>>(new Map())
  const capabilities = shallowRef<AccountStatusCheckCapabilities | null>(null)
  const moduleEnabled = ref(false)
  const openAIRows = computed(() => rows.value.filter(row => appliesToAccount(row.platform)))
  const accountIds = computed(() => [...new Set(openAIRows.value.map(row => row.parent_account_id ?? row.id))])
  const accountIdsKey = computed(() => accountIds.value.join(','))
  let controller: AbortController | null = null

  function cancel() {
    controller?.abort()
    controller = null
  }

  async function refresh(): Promise<void> {
    cancel()
    const ids = accountIds.value
    if (!ids.length) {
      items.value = new Map()
      moduleEnabled.value = false
      return
    }
    const current = new AbortController()
    controller = current
    try {
      const caps = await loadAccountStatusCheckCapabilities()
      if (current.signal.aborted) return
      capabilities.value = caps
      moduleEnabled.value = caps !== null
      if (!caps) {
        items.value = new Map()
        return
      }
      const batches: number[][] = []
      for (let start = 0; start < ids.length; start += STATUS_BATCH_LIMIT) batches.push(ids.slice(start, start + STATUS_BATCH_LIMIT))
      const results = await Promise.all(batches.map(batch => getAccountStatusChecks(batch, current.signal)))
      if (current.signal.aborted) return
      items.value = new Map(results.flat().map(item => [item.account_id, item]))
    } catch {
      // 接口异常只显示未知，不保留可能过期的正常状态。
      if (!current.signal.aborted) items.value = new Map()
    } finally {
      if (controller === current) controller = null
    }
  }

  watch(busy, (isBusy) => {
    if (isBusy) cancel()
    else void refresh()
  })
  watch([accountIdsKey, revision], () => {
    if (!busy()) void refresh()
  }, { immediate: true })
  onScopeDispose(cancel)

  return {
    moduleEnabled,
    statusFor(accountId: number): AccountStatusCheckStatusItem | null {
      const row = openAIRows.value.find(item => item.id === accountId)
      const caps = capabilities.value
      if (!moduleEnabled.value || !row || !caps) return null
      const inheritedFrom = row.parent_account_id ?? null
      const ownerId = inheritedFrom ?? accountId
      const item = items.value.get(ownerId)
      const result = item ?? unknownStatus(accountId)
      return {
        ...result,
        account_id: accountId,
        inherited_from_account_id: inheritedFrom ?? result.inherited_from_account_id ?? null
      }
    },
    refresh
  }
}
