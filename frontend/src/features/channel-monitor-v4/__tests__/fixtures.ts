import type {
  HealthState,
  MonitorCandyHistory,
  MonitorCandyResult,
  MonitorCoverage,
  MonitorHealth,
  MonitorMatrixRow,
  MonitorMetric,
  MonitorModelRow,
} from '@/api/channelMonitorV2'

export const NOW = Date.UTC(2026, 9, 22, 12, 0, 0)

export const metric = (over: Partial<MonitorMetric> = {}): MonitorMetric => ({
  success_requests: 90,
  error_requests: 10,
  request_count: 100,
  token_count: 0,
  rpm: 0,
  tpm: 0,
  error_rate: 0.1,
  cache_rate: 0.5,
  cache_rate_numerator: 0,
  cache_rate_denominator: 0,
  ttft: { sample_count: 100, p50_ms: 800, p95_ms: 2000, avg_ms: 900 },
  duration: { sample_count: 100, p50_ms: 3000, p95_ms: 6000, avg_ms: 3500 },
  ...over,
})

export const noTraffic = (): MonitorMetric =>
  metric({ request_count: 0, success_requests: 0, error_requests: 0, error_rate: 0, ttft: { sample_count: 0, p50_ms: null, p95_ms: null, avg_ms: null } })

export const health = (overall: HealthState): MonitorHealth => ({ overall, error_rate: overall, ttft: overall, minimum_sample: 10 })

export const result = (verdict: MonitorCandyResult['verdict'], minutesAgo: number, latency = 1000): MonitorCandyResult => ({
  checked_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  verdict,
  latency_ms: latency,
})

export const history = (results: MonitorCandyResult[], over: Partial<MonitorCandyHistory> = {}): MonitorCandyHistory => ({
  model: 'gpt-5',
  reasoning_effort: 'medium',
  interval_minutes: 5,
  results,
  ...over,
})

export const row = (over: Partial<MonitorMatrixRow> = {}): MonitorMatrixRow => ({
  platform: 'openai',
  group_id: 1,
  group_name: 'Codex',
  group_rate_multiplier: 0.2,
  metrics: metric(),
  health: health('healthy'),
  buckets: [],
  sample_buckets: [],
  ...over,
})

export const bucket = (minutesAgo: number, overall: HealthState) => ({
  bucket_start: new Date(NOW - minutesAgo * 60_000).toISOString(),
  metrics: metric(),
  health: health(overall),
})

export const modelRow = (model: string, over: Partial<MonitorModelRow> = {}): MonitorModelRow => ({
  platform: 'openai',
  model,
  metrics: metric(),
  health: health('healthy'),
  ...over,
})

export const coverage = (over: Partial<MonitorCoverage> = {}): MonitorCoverage => ({
  requested_start: new Date(NOW - 24 * 3600_000).toISOString(),
  requested_end: new Date(NOW).toISOString(),
  coverage_start: new Date(NOW - 24 * 3600_000).toISOString(),
  data_through: new Date(NOW).toISOString(),
  computed_at: new Date(NOW).toISOString(),
  aggregation_lag_seconds: 0,
  coverage_complete: true,
  bucket_seconds: 300,
  ...over,
})
