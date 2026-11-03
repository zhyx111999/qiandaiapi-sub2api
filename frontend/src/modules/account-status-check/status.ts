import type { AccountStatusCheckHistoryEntry, AccountStatusCheckLatest, AccountStatusCheckState, AccountStatusCheckStatusItem } from './types'

export const HISTORY_SLOTS = 20
export type HistoryCell = AccountStatusCheckHistoryEntry | 'empty'

export const STATE_BADGE_CLASS: Record<AccountStatusCheckState, string> = {
  dead: 'badge-danger',
  error: 'badge-danger',
  degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  normal: 'badge-success',
  unknown: 'badge-gray'
}

export const HISTORY_CELL_CLASS: Record<HistoryCell, string> = {
  normal: 'bg-emerald-500',
  degraded: 'bg-yellow-400',
  error: 'bg-red-500',
  empty: 'bg-gray-200 dark:bg-dark-600'
}

export type AnswerKind = 'none' | 'failed' | 'matched' | 'unmatched'

export const ANSWER_CLASS: Record<AnswerKind, string> = {
  matched: 'text-emerald-600 dark:text-emerald-400',
  unmatched: 'text-yellow-700 dark:text-yellow-400',
  failed: 'text-red-600 dark:text-red-400',
  none: 'text-gray-500 dark:text-gray-400'
}

export function answerKind(latest: AccountStatusCheckLatest | null | undefined): AnswerKind {
  if (!latest) return 'none'
  if (latest.status === 'error') return 'failed'
  if (latest.status === 'degraded') return 'unmatched'
  if (latest.status !== 'normal') return 'none'
  return latest.matched === true ? 'matched' : 'unmatched'
}

export function historyCells(history: readonly AccountStatusCheckHistoryEntry[] | null | undefined): HistoryCell[] {
  const recent = (history ?? []).slice(-HISTORY_SLOTS)
  return [...Array<HistoryCell>(HISTORY_SLOTS - recent.length).fill('empty'), ...recent]
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function formatSeconds(latencyMs: number | null | undefined): string | null {
  return finite(latencyMs) && latencyMs >= 0 ? (latencyMs / 1000).toFixed(1) : null
}

export function formatRate(rate: number | null | undefined): string | null {
  return finite(rate) ? rate.toFixed(1) : null
}

/** 失败和未知不能被旧成功答案盖成正常；正常必须有最新成功结果。 */
export function displayState(item: AccountStatusCheckStatusItem): AccountStatusCheckState {
  if (item.state === 'dead' || item.state === 'error') return item.state
  if (item.latest?.status === 'error') return 'error'
  if (item.state === 'unknown') return 'unknown'
  if (item.state === 'degraded' || item.latest?.status === 'degraded') return 'degraded'
  if (item.state !== 'normal' || !item.latest || item.latest.status !== 'normal') return 'unknown'
  return item.latest.matched === true ? 'normal' : 'degraded'
}
