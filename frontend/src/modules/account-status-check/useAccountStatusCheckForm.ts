import { computed, inject, provide, ref, shallowRef, watch, onScopeDispose, type InjectionKey } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { Account } from '@/types'
import { extractApiErrorCode } from '@/utils/apiError'
import { ERROR_OPENAI_ONLY, getAccountStatusCheck, runAccountStatusCheck, updateAccountStatusCheck } from './api'
import { loadAccountStatusCheckCapabilities } from './capabilities'
import { appliesToAccount, defaultSettings, normalizeSettings, statusCheckErrorMessage, sameSettings, settingsFromConfig } from './model'
import type { AccountStatusCheckCapabilities, AccountStatusCheckConfig, AccountStatusCheckSettings } from './types'
import { notifyAccountStatusCheckChanged } from './useAccountStatusChecks'

export interface AccountStatusCheckFormSource {
  /** 弹窗关闭时清空草稿。 */
  open: () => boolean
  platform: () => string | null | undefined
  parentAccountId?: () => number | null | undefined
  /** 编辑弹窗读取已保存账号的配置。 */
  accountId?: () => number | null | undefined
}

export type AccountStatusCheckForm = ReturnType<typeof createForm>

const FORM_KEY: InjectionKey<AccountStatusCheckForm> = Symbol('account-status-check-form')

const isAccountId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function createForm(source: AccountStatusCheckFormSource) {
  const { t } = useI18n()
  const appStore = useAppStore()
  const authStore = useAuthStore()
  const editing = typeof source.accountId === 'function'

  const capabilities = shallowRef<AccountStatusCheckCapabilities | null>(null)
  const draft = ref<AccountStatusCheckSettings | null>(null)
  const baseline = shallowRef<AccountStatusCheckSettings | null>(null)
  const saved = shallowRef<AccountStatusCheckConfig | null>(null)
  const loading = ref(false)
  const loadError = ref('')
  const unsupported = ref(false)
  const running = ref(false)
  let generation = 0
  let started = false

  // 创建流程由服务端统一初始化；观察员不新增编辑权限。
  const applicable = computed(() => (!editing || !authStore.isObserver) && appliesToAccount(source.platform()))
  const visible = computed(() => applicable.value && capabilities.value !== null && !unsupported.value)
  const inheritedFrom = computed(() => saved.value?.inherited_from_account_id ?? source.parentAccountId?.() ?? null)
  const readOnly = computed(() => inheritedFrom.value != null)
  const canRunNow = computed(() => visible.value && !readOnly.value && editing && !loading.value && !loadError.value &&
    saved.value?.configured !== false && saved.value?.enabled === true && saved.value.check_enabled === true &&
    saved.value.plan_id != null && saved.value.effective_model !== '' && draft.value?.enabled === true && draft.value.check_enabled === true)

  function clear() {
    generation += 1
    started = false
    capabilities.value = null
    draft.value = null
    baseline.value = null
    saved.value = null
    loading.value = false
    loadError.value = ''
    unsupported.value = false
    running.value = false
  }

  async function initialize(accountId: number | null | undefined) {
    started = true
    const run = generation
    const caps = await loadAccountStatusCheckCapabilities()
    if (run !== generation || !caps) return
    if (!editing) {
      capabilities.value = caps
      draft.value = defaultSettings(caps)
      return
    }
    if (!isAccountId(accountId)) return
    capabilities.value = caps
    loading.value = true
    try {
      const config = await getAccountStatusCheck(accountId)
      if (run !== generation) return
      saved.value = config
      baseline.value = settingsFromConfig(config, caps)
      draft.value = { ...baseline.value }
    } catch (error) {
      if (run !== generation) return
      if (extractApiErrorCode(error) === ERROR_OPENAI_ONLY) unsupported.value = true
      else loadError.value = statusCheckErrorMessage(error, t)
    } finally {
      if (run === generation) loading.value = false
    }
  }

  // 切换账号或关闭弹窗时使旧请求失效；全部 OpenAI 类型共享同一入口。
  watch(
    () => [source.open(), source.accountId?.(), applicable.value] as const,
    ([open, accountId, isApplicable], previous) => {
      if (!open || !previous?.[0] || previous[1] !== accountId) clear()
      if (open && isApplicable && !started) void initialize(accountId)
    },
    { immediate: true }
  )

  /** 数字输入遵循服务端能力边界，不改变服务端调度规则。 */
  function normalizeDraft() {
    if (draft.value && capabilities.value) draft.value = normalizeSettings(draft.value, capabilities.value)
  }

  function settingsToSave(): AccountStatusCheckSettings | null {
    if (!visible.value || readOnly.value || !draft.value || !capabilities.value) return null
    return normalizeSettings(draft.value, capabilities.value)
  }

  /** 仅提交变化的检测配置；不读取、不分配、不修改代理。 */
  async function saveEdited(account: Account): Promise<Account> {
    const settings = settingsToSave()
    if (!editing || account.id !== source.accountId?.() || !settings || !baseline.value || loading.value || loadError.value) return account
    if (sameSettings(settings, baseline.value)) return account
    const run = generation
    try {
      const config = await updateAccountStatusCheck(account.id, settings)
      if (run !== generation) return account
      saved.value = config
      baseline.value = settingsFromConfig(config, capabilities.value!)
      draft.value = { ...baseline.value }
      notifyAccountStatusCheckChanged()
      return account
    } catch (error) {
      if (run === generation) appStore.showError(t('accountStatusCheck.errors.saveFailed', { reason: statusCheckErrorMessage(error, t) }), 10000)
      return account
    }
  }

  /** 只调用原计划的立即执行接口，不创建第二套检测器或处罚。 */
  async function runNow(): Promise<void> {
    const accountId = source.accountId?.()
    if (!canRunNow.value || running.value || !isAccountId(accountId)) return
    running.value = true
    const run = generation
    try {
      await runAccountStatusCheck(accountId)
      if (run !== generation) return
      notifyAccountStatusCheckChanged()
      appStore.showSuccess(t('accountStatusCheck.runStarted'))
    } catch (error) {
      if (run === generation) appStore.showError(statusCheckErrorMessage(error, t))
    } finally {
      if (run === generation) running.value = false
    }
  }

  onScopeDispose(clear)

  return {
    editing,
    readOnly,
    inheritedFrom,
    capabilities,
    draft,
    saved,
    loading,
    loadError,
    running,
    visible,
    canRunNow,
    normalizeDraft,
    saveEdited,
    runNow
  }
}

/** 宿主只提供账号上下文、渲染区块，并在保存账号后调用一次保存钩子。 */
export function useAccountStatusCheckForm(source: AccountStatusCheckFormSource): AccountStatusCheckForm {
  const form = createForm(source)
  provide(FORM_KEY, form)
  return form
}

export function injectAccountStatusCheckForm(): AccountStatusCheckForm | null {
  return inject(FORM_KEY, null)
}
