import type { MonitorStatus, MonitorTimelinePoint } from '@/api/channelMonitor'
import type {
  HealthState,
  MonitorCandyHistory,
  MonitorCoverage,
  MonitorMatrixRow,
  MonitorModelRow,
  MonitorRange,
} from '@/api/channelMonitorV2'
import {
  MONITOR_CARD_SLOT_COUNT,
  candyDisplayState,
  candyHistoryLimit,
  hasMonitorSamples,
  monitorCandyHistories,
  monitorCardTimeline,
  type MonitorCardTimelineMode,
} from '@/features/channel-monitor-v2/monitorCards'
import { usageOutputTps } from '@/utils/usageTps'
import type { MonitorGroupInsight, MonitorRequestSample } from './api'

/** The windows the v2 read API serves, and the one the page opens on. */
export const MONITOR_RANGES: readonly MonitorRange[] = ['90m', '24h', '7d', '30d']
export const DEFAULT_RANGE: MonitorRange = '24h'

/** v1 card status. '' means nothing fresh to judge by. */
export type CardStatus = Exclude<MonitorStatus, 'error'> | ''

const SEVERITY: Record<CardStatus, number> = { '': 0, operational: 1, degraded: 2, failed: 3 }
const CANDY_STATUS = { correct: 'operational', incorrect: 'degraded', error: 'failed' } as const
const HEALTH_STATUS: Record<HealthState, CardStatus> = { healthy: 'operational', warning: 'degraded', critical: 'failed', unknown: '' }
/** v1 timelines hold at most 60 points. */
const TIMELINE_LENGTH_MAX = 60
/** First-token bars on a card. */
export const FIRST_TOKEN_SAMPLES = 30

export function worstStatus(statuses: readonly CardStatus[]): CardStatus {
  return statuses.reduce<CardStatus>((worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst), '')
}

/** Latest probe verdict; a probe that is overdue or has no result says nothing. */
export function candyStatus(history: MonitorCandyHistory, now: number): CardStatus {
  const state = candyDisplayState(history, now)
  return state === 'stale' || state === 'unknown' ? '' : CANDY_STATUS[state]
}

export function healthStatus(health: HealthState): CardStatus {
  return HEALTH_STATUS[health]
}

/** Latest probe latency; a failed probe has no meaningful latency. */
export function candyLatency(history: MonitorCandyHistory): number | null {
  const latest = history.results.at(-1)
  return latest && latest.verdict !== 'error' ? latest.latency_ms : null
}

/** Accuracy over answered probes (probe failures are not wrong answers) and their mean latency. */
export function candyStats(histories: readonly MonitorCandyHistory[]): { accuracy: number | null; meanLatency: number | null } {
  const answered = histories.flatMap((history) => history.results).filter((result) => result.verdict !== 'error')
  const correct = answered.filter((result) => result.verdict === 'correct').length
  const timed = answered.filter((result) => result.latency_ms > 0)
  return {
    accuracy: answered.length ? (correct / answered.length) * 100 : null,
    meanLatency: timed.length ? timed.reduce((sum, result) => sum + result.latency_ms, 0) / timed.length : null,
  }
}

export function candyLabel(history: Pick<MonitorCandyHistory, 'model' | 'reasoning_effort'>): string {
  return [history.model, history.reasoning_effort].filter(Boolean).join(' · ')
}

/** Passive availability in percent; null while the group has no real requests. */
export function passiveAvailability(row: Pick<MonitorMatrixRow, 'metrics'>): number | null {
  return hasMonitorSamples(row.metrics) ? (1 - row.metrics.error_rate) * 100 : null
}

export interface MonitorCard {
  key: string
  platform: string
  groupId: number
  row: MonitorMatrixRow
  name: string
  /** Effective rate for the viewer: their own multiplier for the group, else the group's. */
  rate: number | null
  model: string
  extraModels: number
  status: CardStatus
  /** Real requests with a recorded first token, newest first. */
  samples: MonitorRequestSample[]
  latestFirstToken: number | null
  /** Output rate of the newest sample by the usage-table rule; unknown when that sample has none. */
  outputRate: number | null
  /** Cache rate over the last 30 minutes, 0..1. */
  cacheRate: number | null
  availability: number | null
  candyAccuracy: number | null
  /** Newest first, as the v1 timeline expects. */
  timeline: MonitorTimelinePoint[]
  timelineLength: number
}

export interface CardContext {
  coverage?: MonitorCoverage
  timelineMode: MonitorCardTimelineMode
  now: number
  insights?: ReadonlyMap<number, MonitorGroupInsight>
  /** The viewer's own multipliers by group id; 0 is a valid rate. */
  userRates?: Readonly<Record<number, number>>
}

// MonitorTimeline draws a point without a status ('') as an empty bar.
const point = (status: CardStatus, latency: number | null, checkedAt: string): MonitorTimelinePoint => ({
  status: status as MonitorStatus,
  latency_ms: latency,
  ping_latency_ms: null,
  checked_at: checkedAt,
})

// The group's first probe drives the timeline; without results the real traffic does.
function timelineOf(row: MonitorMatrixRow, primary: MonitorCandyHistory | undefined, ctx: CardContext) {
  if (primary?.results.length) {
    const limit = candyHistoryLimit(primary)
    return {
      length: Math.min(limit, TIMELINE_LENGTH_MAX),
      points: primary.results
        .slice(-limit)
        .reverse()
        .map((result) => point(CANDY_STATUS[result.verdict], result.latency_ms, result.checked_at)),
    }
  }
  return {
    length: MONITOR_CARD_SLOT_COUNT,
    points: monitorCardTimeline(row, ctx.coverage, ctx.timelineMode)
      .map((bar) => point(HEALTH_STATUS[bar.state], bar.buckets.at(-1)?.metrics.ttft.p50_ms ?? null, new Date(bar.start).toISOString()))
      .reverse(),
  }
}

function toCard(row: MonitorMatrixRow, ctx: CardContext): MonitorCard {
  const histories = monitorCandyHistories(row)
  const [primary] = histories
  const timeline = timelineOf(row, primary, ctx)
  const groupId = Number(row.group_id)
  const insight = ctx.insights?.get(groupId)
  const samples = (insight?.samples ?? []).slice(0, FIRST_TOKEN_SAMPLES)
  return {
    key: `${row.platform}-${row.group_id}`,
    platform: row.platform,
    groupId,
    row,
    name: row.group_name || `#${row.group_id}`,
    rate: ctx.userRates?.[groupId] ?? row.group_rate_multiplier ?? null,
    model: primary ? candyLabel(primary) : '',
    extraModels: Math.max(0, histories.length - 1),
    status: worstStatus([healthStatus(row.health.overall), ...histories.map((history) => candyStatus(history, ctx.now))]),
    samples,
    latestFirstToken: samples[0]?.first_token_ms ?? null,
    outputRate: samples.length ? usageOutputTps(samples[0]) : null,
    cacheRate: insight?.cache_rate ?? null,
    availability: passiveAvailability(row),
    candyAccuracy: candyStats(histories).accuracy,
    timeline: timeline.points,
    timelineLength: timeline.length,
  }
}

/** Codex first, Claude second; finish each platform in the viewer's effective rate order. */
export function buildCards(rows: readonly MonitorMatrixRow[], platformOrder: readonly string[], ctx: CardContext): MonitorCard[] {
  const cards = rows
    .filter((row) => Number(row.group_id) > 0)
    .map((row) => toCard(row, ctx))
  const platforms = [...new Set(['openai', 'anthropic', ...platformOrder, ...cards.map((card) => card.platform)])]
  const ranks = new Map(platforms.map((platform, index) => [platform, index]))
  const rateRank = (rate: number | null) => (rate !== null && Number.isFinite(rate) ? rate : Infinity)
  return cards.sort((a, b) => {
    const platformDifference = ranks.get(a.platform)! - ranks.get(b.platform)!
    if (platformDifference) return platformDifference
    const aRate = rateRank(a.rate)
    const bRate = rateRank(b.rate)
    return aRate === bRate ? 0 : aRate < bRate ? -1 : 1
  })
}

/** The windows the detail dialog compares a model over; the first one also gives health and first-token time. */
export const DETAIL_RANGES: readonly MonitorRange[] = ['24h', '7d', '30d']

export interface ModelDetail {
  model: string
  health: HealthState
  ttft: number | null
  /** Availability per DETAIL_RANGES entry. */
  availability: Array<number | null>
}

/** Joins the model lists of the DETAIL_RANGES windows, given in that order. */
export function modelDetails(lists: ReadonlyArray<readonly MonitorModelRow[]>): ModelDetail[] {
  const models = new Set(lists.flatMap((list) => list.map((row) => row.model)))
  return [...models].sort().map((model) => {
    const rows = lists.map((list) => list.find((row) => row.model === model))
    const [head] = rows
    return {
      model,
      health: head?.health.overall ?? 'unknown',
      ttft: head && hasMonitorSamples(head.metrics) ? head.metrics.ttft.p50_ms : null,
      availability: rows.map((row) => (row ? passiveAvailability(row) : null)),
    }
  })
}
