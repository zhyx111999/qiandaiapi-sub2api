import { describe, expect, it } from 'vitest'
import {
  buildCards,
  candyLatency,
  candyStats,
  candyStatus,
  modelDetails,
  passiveAvailability,
  worstStatus,
} from '../cards'
import { NOW, bucket, coverage, health, history, metric, modelRow, noTraffic, result, row } from './fixtures'

const ctx = { timelineMode: 'samples' as const, now: NOW }
const cardOf = (over: Parameters<typeof row>[0]) => buildCards([row(over)], [], ctx)[0]

describe('card status', () => {
  it('takes the worst status and says nothing without any', () => {
    expect(worstStatus([])).toBe('')
    expect(worstStatus(['', ''])).toBe('')
    expect(worstStatus(['operational', '', 'degraded'])).toBe('degraded')
    expect(worstStatus(['degraded', 'failed', 'operational'])).toBe('failed')
  })

  it('maps a fresh probe verdict and ignores a stale or empty probe', () => {
    expect(candyStatus(history([result('correct', 1)]), NOW)).toBe('operational')
    expect(candyStatus(history([result('incorrect', 1)]), NOW)).toBe('degraded')
    expect(candyStatus(history([result('error', 1)]), NOW)).toBe('failed')
    expect(candyStatus(history([result('correct', 30)]), NOW)).toBe('')
    expect(candyStatus(history([]), NOW)).toBe('')
  })

  it.each([
    ['healthy traffic, wrong answer', 'healthy', 'incorrect', 'degraded'],
    ['critical traffic, right answer', 'critical', 'correct', 'failed'],
    ['warning traffic, right answer', 'warning', 'correct', 'degraded'],
    ['too little traffic, right answer', 'unknown', 'correct', 'operational'],
    ['healthy traffic, probe failed', 'healthy', 'error', 'failed'],
  ] as const)('combines traffic health and probe: %s', (_name, passive, verdict, expected) => {
    const card = cardOf({ health: health(passive), candy_checks: [history([result(verdict, 1)])] })
    expect(card.status).toBe(expected)
  })

  it('relies on traffic when the probe is overdue and on neither when nothing is fresh', () => {
    expect(cardOf({ health: health('healthy'), candy_checks: [history([result('correct', 60)])] }).status).toBe('operational')
    expect(cardOf({ health: health('unknown') }).status).toBe('')
    expect(cardOf({ health: health('unknown'), candy_checks: [history([result('correct', 60)])] }).status).toBe('')
  })

  it('judges every probe of the group', () => {
    const checks = [history([result('correct', 1)]), history([result('error', 1)], { model: 'other' })]
    expect(cardOf({ candy_checks: checks }).status).toBe('failed')
  })
})

describe('card figures', () => {
  it('shows real-request availability only when there was traffic', () => {
    expect(passiveAvailability(row())).toBeCloseTo(90)
    expect(passiveAvailability(row({ metrics: noTraffic() }))).toBeNull()
    expect(cardOf({ metrics: noTraffic() })).toMatchObject({ availability: null })
  })

  it('takes first token, output rate and cache rate from the real-request insight', () => {
    const sample = (first_token_ms: number, over: Record<string, unknown> = {}) => ({
      at: new Date(NOW).toISOString(), first_token_ms, duration_ms: 4000, output_tokens: 200, image_count: 0, image_output_tokens: 0, billing_mode: null, ...over,
    })
    const insightCard = (samples: ReturnType<typeof sample>[], cache_rate: number | null = 0.5) =>
      buildCards([row()], [], { ...ctx, insights: new Map([[1, { group_id: 1, samples, cache_rate }]]) })[0]
    expect(insightCard([sample(1500), sample(900)])).toMatchObject({ latestFirstToken: 1500, outputRate: 50, cacheRate: 0.5 })
    expect(insightCard([sample(1500, { image_count: 1 }), sample(900)]).outputRate).toBeNull()
    expect(insightCard(Array.from({ length: 40 }, (_, i) => sample(i))).samples).toHaveLength(30)
    expect(insightCard([], null)).toMatchObject({ samples: [], latestFirstToken: null, outputRate: null, cacheRate: null })
    expect(cardOf({})).toMatchObject({ samples: [], latestFirstToken: null, outputRate: null, cacheRate: null })
  })

  it("prefers the viewer's own rate for the group, including zero", () => {
    const rated = (userRates: Record<number, number>) => buildCards([row()], [], { ...ctx, userRates })[0].rate
    expect(rated({})).toBe(0.2)
    expect(rated({ 1: 0.072 })).toBe(0.072)
    expect(rated({ 1: 0 })).toBe(0)
    expect(rated({ 2: 0.5 })).toBe(0.2)
  })

  it('keeps probe failures out of accuracy and latency', () => {
    const results = [result('correct', 3, 1000), result('incorrect', 2, 3000), result('error', 1, 90000)]
    expect(candyStats([history(results)])).toEqual({ accuracy: 50, meanLatency: 2000 })
    expect(candyStats([history([result('error', 1)])])).toEqual({ accuracy: null, meanLatency: null })
    expect(candyStats([])).toEqual({ accuracy: null, meanLatency: null })
    expect(candyLatency(history(results))).toBeNull()
    expect(candyLatency(history(results.slice(0, 2)))).toBe(3000)
  })

  it('names the first probe and counts the others', () => {
    const card = cardOf({ candy_checks: [history([result('correct', 1)]), history([], { model: 'b' }), history([], { model: 'c' })] })
    expect(card).toMatchObject({ model: 'gpt-5 · medium', extraModels: 2, rate: 0.2, name: 'Codex', key: 'openai-1', platform: 'openai', groupId: 1 })
    expect(cardOf({ group_name: undefined })).toMatchObject({ name: '#1', model: '', extraModels: 0 })
    expect(cardOf({ group_rate_multiplier: undefined }).rate).toBeNull()
  })
})

describe('card timeline', () => {
  it('shows the first probe newest first, capped at 60 points', () => {
    const results = [result('correct', 3, 10), result('incorrect', 2, 20), result('error', 1, 30)]
    const card = cardOf({ candy_checks: [history(results)] })
    expect(card.timeline.map((point) => point.status)).toEqual(['failed', 'degraded', 'operational'])
    expect(card.timeline.map((point) => point.latency_ms)).toEqual([30, 20, 10])
    expect(card.timelineLength).toBe(60)
    const limited = cardOf({ candy_checks: [history(results, { history_limit: 20 })] })
    expect(limited.timelineLength).toBe(20)
    expect(limited.timeline).toHaveLength(3)
  })

  it('falls back to real traffic when the probe has no results', () => {
    const sample_buckets = [bucket(15, 'healthy'), bucket(10, 'warning'), bucket(5, 'critical')]
    const card = cardOf({ sample_buckets, candy_checks: [history([])] })
    expect(card.timeline.map((point) => point.status)).toEqual(['failed', 'degraded', 'operational'])
    expect(card.timeline[0].latency_ms).toBe(800)
    expect(card.timelineLength).toBe(18)
    expect(cardOf({ sample_buckets }).timeline).toHaveLength(3)
  })

  it('draws time windows without traffic as empty points', () => {
    const windows = { ...ctx, timelineMode: 'windows' as const, coverage: coverage() }
    const card = buildCards([row({ buckets: [bucket(10, 'warning')] })], [], windows)[0]
    expect(card.timeline).toHaveLength(18)
    expect(card.timeline.filter((point) => point.status === '')).toHaveLength(17)
    expect(card.timeline[0].status).toBe('degraded')
    expect(buildCards([row()], [], { ...windows, coverage: undefined })[0].timeline).toEqual([])
  })
})

describe('buildCards', () => {
  it('sorts the screenshot rates numerically instead of retaining API order', () => {
    const rows = [0.18, 0.15, 0.12, 0.2].map((rate, index) => row({
      group_id: index + 1,
      group_rate_multiplier: rate,
    }))
    expect(buildCards(rows, ['openai'], ctx).map((card) => card.rate)).toEqual([0.12, 0.15, 0.18, 0.2])
  })

  it('lists real groups only, with Codex first and Claude second regardless of configuration', () => {
    const rows = [
      row({ platform: 'gemini', group_id: 5 }),
      row({ platform: 'openai', group_id: 2 }),
      row({ platform: 'openai', group_id: 0 }),
      row({ platform: 'openai', group_id: undefined }),
      row({ platform: 'anthropic', group_id: 3 }),
      row({ platform: 'openai', group_id: 1 }),
    ]
    const expected = ['openai-2', 'openai-1', 'anthropic-3', 'gemini-5']
    expect(buildCards(rows, ['gemini', 'anthropic', 'openai'], ctx).map((card) => card.key)).toEqual(expected)
    expect(buildCards(rows, [], ctx).map((card) => card.key)).toEqual(expected)
  })

  it('finishes each platform in effective rate order before moving to the next platform', () => {
    const rows = [
      row({ platform: 'gemini', group_id: 5, group_rate_multiplier: 2 }),
      row({ platform: 'openai', group_id: 2, group_rate_multiplier: 0.1 }),
      row({ platform: 'anthropic', group_id: 3, group_rate_multiplier: 0.5 }),
      row({ platform: 'grok', group_id: 7, group_rate_multiplier: 0.01 }),
      row({ platform: 'openai', group_id: 1, group_rate_multiplier: 1 }),
      row({ platform: 'anthropic', group_id: 4, group_rate_multiplier: 0.2 }),
      row({ platform: 'gemini', group_id: 6, group_rate_multiplier: 1 }),
    ]
    const original = structuredClone(rows)
    const order = ['grok', 'anthropic', 'gemini', 'openai']
    const cards = buildCards(rows, order, { ...ctx, userRates: { 1: 0, 2: 0.3 } })
    expect(cards.map((card) => card.key)).toEqual(['openai-1', 'openai-2', 'anthropic-4', 'anthropic-3', 'grok-7', 'gemini-6', 'gemini-5'])
    expect(cards.slice(0, 2).map((card) => card.rate)).toEqual([0, 0.3])
    expect(rows).toEqual(original)
    expect(order).toEqual(['grok', 'anthropic', 'gemini', 'openai'])
  })

  it('keeps unconfigured platforms together in their first-seen order', () => {
    const rows = [
      row({ platform: 'grok', group_id: 1, group_rate_multiplier: 0.5 }),
      row({ platform: 'gemini', group_id: 2, group_rate_multiplier: 0 }),
      row({ platform: 'grok', group_id: 3, group_rate_multiplier: 0.1 }),
    ]
    expect(buildCards(rows, [], ctx).map((card) => card.key)).toEqual(['grok-3', 'grok-1', 'gemini-2'])
  })

  it('puts missing and non-finite rates last and preserves input order for ties', () => {
    const rates = [undefined, 0.2, Number.NaN, 0, Number.POSITIVE_INFINITY, 0.2, Number.NEGATIVE_INFINITY]
    const rows = rates.map((rate, index) => row({ group_id: index + 1, group_rate_multiplier: rate }))
    expect(buildCards(rows, [], ctx).map((card) => card.groupId)).toEqual([4, 2, 6, 1, 3, 5, 7])
  })
})

describe('modelDetails', () => {
  it('joins the windows per model and takes health and first token from the first window', () => {
    const day = [modelRow('b', { health: health('warning'), metrics: metric({ error_rate: 0.5, ttft: { sample_count: 1, p50_ms: 500, p95_ms: 1, avg_ms: 1 } }) })]
    const week = [modelRow('a'), modelRow('b', { metrics: metric({ error_rate: 0.2 }) })]
    const month = [modelRow('a', { metrics: noTraffic() })]
    expect(modelDetails([day, week, month])).toEqual([
      { model: 'a', health: 'unknown', ttft: null, availability: [null, 90, null] },
      { model: 'b', health: 'warning', ttft: 500, availability: [50, 80, null] },
    ])
    expect(modelDetails([[], [], []])).toEqual([])
  })
})
