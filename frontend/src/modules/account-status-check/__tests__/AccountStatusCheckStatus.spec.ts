import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { formatDateTime } from '@/utils/format'
import AccountStatusCheckStatus from '../AccountStatusCheckStatus.vue'
import type { AccountStatusCheckStatusItem } from '../types'
import { statusItem, zhI18n } from './fixtures'

const render = (status: AccountStatusCheckStatusItem | null) => mount(AccountStatusCheckStatus, {
  props: { status },
  global: { plugins: [zhI18n()], stubs: { Icon: true } }
})
const text = (wrapper: ReturnType<typeof render>, id: string) => wrapper.get(`[data-testid="account-status-check-${id}"]`).text()

describe('账号状态检测列表', () => {
  it('正常账号展示最新糖果结果、实际模型和历史', () => {
    const wrapper = render(statusItem())
    expect(text(wrapper, 'state')).toBe('正常')
    expect(text(wrapper, 'answer')).toBe('答题测试：匹配 21')
    expect(text(wrapper, 'rate')).toBe('15/15 匹配 · 100.0%')
    expect(text(wrapper, 'timing')).toBe(`33.8 秒 · ${formatDateTime('2026-10-30T02:46:01Z')}`)
    expect(text(wrapper, 'plan')).toBe('gpt-6-astra · low · 每 2 分钟')
    expect(wrapper.get('[data-testid="account-status-check-answer"]').classes()).toContain('text-emerald-600')
  })

  it.each([
    ['dead', '号不行了', 'badge-danger'],
    ['error', '检测失败', 'badge-danger'],
    ['degraded', '降智', 'bg-yellow-100'],
    ['normal', '正常', 'badge-success'],
    ['unknown', '未检测', 'badge-gray']
  ] as const)('状态 %s 显示对应标签与颜色', (state, label, badgeClass) => {
    const badge = render(statusItem({ state })).get('[data-testid="account-status-check-state"]')
    expect(badge.text()).toBe(label)
    expect(badge.classes()).toContain(badgeClass)
  })

  it('绘制最近二十次历史，缺失项留灰', () => {
    const wrapper = render(statusItem({ history: ['error', 'degraded', ...Array(13).fill('normal')] }))
    const cells = wrapper.findAll('[data-testid="account-status-check-history"] > span')
    expect(cells).toHaveLength(20)
    expect(cells.map(cell => cell.attributes('data-cell'))).toEqual([...Array(5).fill('empty'), 'error', 'degraded', ...Array(13).fill('normal')])
    expect(cells[0].classes()).toContain('bg-gray-200')
    expect(cells[5].classes()).toContain('bg-red-500')
    expect(cells[6].classes()).toContain('bg-yellow-400')
    expect(cells[19].classes()).toContain('bg-emerald-500')
  })

  it('历史条只保留最近二十次结果', () => {
    const history = [...Array(5).fill('error'), ...Array(20).fill('normal')]
    const cells = render(statusItem({ history })).findAll('[data-testid="account-status-check-history"] > span')
    expect(cells.every(cell => cell.attributes('data-cell') === 'normal')).toBe(true)
  })

  it('无结果时保持未检测而不是正常', () => {
    expect(text(render(statusItem({ matched: 12, completed: 15, rate: 80 })), 'rate')).toBe('12/15 匹配 · 80.0%')
    expect(text(render(statusItem({ matched: 0, completed: 0, rate: null, latest: null, history: [], state: 'unknown' })), 'rate')).toBe('0/0 匹配')
  })

  it('显示答错、失败与空结果的真实状态', () => {
    const unmatched = render(statusItem({ state: 'degraded', latest: { status: 'degraded', matched: false, answer_hint: '20', latency_ms: 1200, started_at: null } }))
    expect(text(unmatched, 'answer')).toBe('答题测试：未匹配（答 20）')
    expect(unmatched.get('[data-testid="account-status-check-answer"]').classes()).toContain('text-yellow-700')
    expect(text(unmatched, 'timing')).toBe('1.2 秒')

    const failed = render(statusItem({ state: 'error', latest: { status: 'error', matched: false, answer_hint: null, latency_ms: null, started_at: null } }))
    expect(text(failed, 'answer')).toBe('答题测试：检测失败')
    expect(failed.get('[data-testid="account-status-check-answer"]').classes()).toContain('text-red-600')
    expect(failed.find('[data-testid="account-status-check-timing"]').exists()).toBe(false)

    const none = render(statusItem({ state: 'unknown', latest: null, history: [] }))
    expect(text(none, 'answer')).toBe('答题测试：暂无结果')
  })

  it('账号异常不改写最后一次答题事实', () => {
    const previousMatch = render(statusItem({ state: 'dead' }))
    expect(text(previousMatch, 'state')).toBe('号不行了')
    expect(text(previousMatch, 'answer')).toBe('答题测试：匹配 21')
    const neverChecked = render(statusItem({ state: 'dead', latest: null, history: [] }))
    expect(text(neverChecked, 'answer')).toBe('答题测试：暂无结果')
  })

  it('显示计划实际模型和自动检测关闭历史', () => {
    expect(text(render(statusItem({ model: '', check_enabled: false })), 'plan')).toBe('按账号模型配置选择 · low · 自动检测已关闭')
  })

  it('没有模块摘要时隐藏，条目关闭时明确显示状态检测已关闭', () => {
    expect(render(null).find('[data-testid="account-status-check"]').exists()).toBe(false)
    const wrapper = render(statusItem({ enabled: false }))
    expect(text(wrapper, 'disabled')).toBe('状态检测已关闭')
    expect(wrapper.find('[data-testid="account-status-check-state"]').exists()).toBe(false)
  })

  it('自动检测关闭仍显示历史', () => {
    const wrapper = render(statusItem({ check_enabled: false }))
    expect(wrapper.findAll('[data-cell="normal"]')).toHaveLength(15)
    expect(text(wrapper, 'plan')).toContain('自动检测已关闭')
  })

  it.each([true, false])('继承提示在 enabled=%s 时仍只读可见', (enabled) => {
    const wrapper = render(statusItem({ enabled, inherited_from_account_id: 7 }))
    expect(text(wrapper, 'inherited')).toContain('只读继承母账号')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('失败和未知不能被旧成功答案显示成正常', () => {
    for (const state of ['error', 'unknown'] as const) {
      const wrapper = render(statusItem({ state }))
      expect(text(wrapper, 'state')).not.toBe('正常')
      expect(wrapper.get('[data-testid="account-status-check-answer"]').classes()).not.toContain('text-emerald-600')
    }
    const inconsistent = render(statusItem({ state: 'normal', latest: { status: 'error', matched: true, answer_hint: '21', latency_ms: null, started_at: null } }))
    expect(text(inconsistent, 'state')).toBe('检测失败')
    expect(text(render(statusItem({ state: 'normal', latest: null })), 'state')).toBe('未检测')
  })
})
