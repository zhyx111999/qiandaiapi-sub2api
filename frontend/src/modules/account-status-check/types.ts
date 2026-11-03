export type AccountStatusCheckState = 'dead' | 'error' | 'degraded' | 'normal' | 'unknown'
export type AccountStatusCheckHistoryEntry = 'normal' | 'degraded' | 'error'

export interface AccountStatusCheckCapabilities {
  defaults: {
    interval_minutes: number
    reasoning_effort: string
    timeout_seconds: number
    disable_on_degraded: boolean
    reopen_on_recovered: boolean
    models: Record<string, string>
  }
  limits: {
    interval_min: number
    interval_max: number
    timeout_min: number
    timeout_max: number
  }
  efforts: string[]
}

export interface AccountStatusCheckSettings {
  enabled: boolean
  check_enabled: boolean
  interval_minutes: number
  model: string
  reasoning_effort: string
  timeout_seconds: number
  /** 答错（降智）时关闭账号调度；请求失败不触发。 */
  disable_on_degraded: boolean
  /** 降智关闭调度后继续检测、答对 21 重新打开；不开启时降智关闭调度后停止自动检测。可单独开启，没有本功能关闭的调度时不起作用。 */
  reopen_on_recovered: boolean
}

export interface AccountStatusCheckConfig extends AccountStatusCheckSettings {
  account_id: number
  configured?: boolean
  plan_id: number | null
  effective_model: string
  inherited_from_account_id: number | null
}

export interface AccountStatusCheckLatest {
  status: AccountStatusCheckHistoryEntry
  matched: boolean
  answer_hint: string | null
  latency_ms: number | null
  started_at: string | null
}

export interface AccountStatusCheckStatusItem {
  account_id: number
  enabled: boolean
  state: AccountStatusCheckState
  latest: AccountStatusCheckLatest | null
  history: AccountStatusCheckHistoryEntry[]
  matched: number
  completed: number
  rate: number | null
  model: string
  reasoning_effort: string
  interval_minutes: number
  check_enabled: boolean
  inherited_from_account_id: number | null
}
