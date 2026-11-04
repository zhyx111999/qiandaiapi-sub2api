import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { getAccountStatusChecks } from './api'
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
      const results = await getAccountStatusChecks(ids, current.signal)
      if (current.signal.aborted) return
      items.value = new Map(results.map(item => [item.account_id, item]))
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
      // 只显示打开了检测的账号；没有记录或读取失败时不显示，不保留可能过期的结果。
      const item = items.value.get(ownerId)
      if (!item?.enabled) return null
      return {
        ...item,
        account_id: accountId,
        inherited_from_account_id: inheritedFrom ?? item.inherited_from_account_id ?? null
      }
    },
    refresh
  }
}
