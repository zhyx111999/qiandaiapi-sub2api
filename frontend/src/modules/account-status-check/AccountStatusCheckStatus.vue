<template>
  <div
    v-if="status"
    class="mt-1.5 flex flex-col items-start gap-1 text-xs leading-4"
    data-testid="account-status-check"
    :data-state="status.enabled ? state : 'disabled'"
  >
    <template v-if="status.enabled">
      <span :class="['badge', STATE_BADGE_CLASS[state]]" data-testid="account-status-check-state">
        {{ t(`accountStatusCheck.states.${state}`) }}
      </span>
      <span :class="['font-medium', ANSWER_CLASS[answer]]" data-testid="account-status-check-answer" :data-answer="answer">
        {{ answerText }}
      </span>
      <div class="flex items-center gap-0.5" data-testid="account-status-check-history" :aria-label="t('accountStatusCheck.historyLabel')">
        <span
          v-for="(cell, index) in cells"
          :key="index"
          :class="['h-2.5 w-1.5 rounded-sm', HISTORY_CELL_CLASS[cell]]"
          :data-cell="cell"
        />
      </div>
      <span class="text-gray-500 dark:text-gray-300" data-testid="account-status-check-rate">{{ rateText }}</span>
      <span v-if="timingText" class="text-gray-400" data-testid="account-status-check-timing">{{ timingText }}</span>
      <span class="text-gray-400" data-testid="account-status-check-plan">{{ planText }}</span>
    </template>
    <span v-else class="badge badge-gray" data-testid="account-status-check-disabled">
      {{ t('accountStatusCheck.disabled') }}
    </span>
    <span v-if="status.inherited_from_account_id != null" class="text-gray-500 dark:text-gray-400" data-testid="account-status-check-inherited">
      {{ t('accountStatusCheck.inheritedResult') }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '@/utils/format'
import { ANSWER_CLASS, HISTORY_CELL_CLASS, STATE_BADGE_CLASS, answerKind, displayState, formatRate, formatSeconds, historyCells } from './status'
import type { AccountStatusCheckStatusItem } from './types'

const props = defineProps<{ status: AccountStatusCheckStatusItem | null | undefined }>()
const { t } = useI18n()

const state = computed(() => props.status ? displayState(props.status) : 'unknown')
const latest = computed(() => props.status?.latest ?? null)
const answer = computed(() => state.value === 'unknown' ? 'none' : state.value === 'error' ? 'failed' : state.value === 'degraded' ? 'unmatched' : answerKind(latest.value))
const answerText = computed(() => {
  const hint = latest.value?.answer_hint?.trim() || ''
  switch (answer.value) {
    case 'matched': return t('accountStatusCheck.answer.matched', { answer: hint || '21' })
    case 'unmatched': return hint ? t('accountStatusCheck.answer.unmatchedWith', { answer: hint }) : t('accountStatusCheck.answer.unmatched')
    case 'failed': return t('accountStatusCheck.answer.failed')
    default: return t('accountStatusCheck.answer.none')
  }
})
const cells = computed(() => historyCells(props.status?.history))
const rateText = computed(() => {
  const counts = { matched: props.status?.matched ?? 0, completed: props.status?.completed ?? 0 }
  const rate = formatRate(props.status?.rate)
  return rate === null ? t('accountStatusCheck.counts', counts) : t('accountStatusCheck.countsWithRate', { ...counts, rate })
})
const timingText = computed(() => {
  const seconds = formatSeconds(latest.value?.latency_ms)
  return [seconds === null ? '' : t('accountStatusCheck.seconds', { value: seconds }), formatDateTime(latest.value?.started_at)].filter(Boolean).join(' · ')
})
const planText = computed(() => {
  const status = props.status
  if (!status) return ''
  if (status.model === '' && status.reasoning_effort === '' && status.interval_minutes <= 0 && !status.latest) return ''
  return [
    status.model || t('accountStatusCheck.defaultModel'),
    status.reasoning_effort,
    status.check_enabled ? t('accountStatusCheck.everyMinutes', { minutes: status.interval_minutes }) : t('accountStatusCheck.checkOff')
  ].filter(Boolean).join(' · ')
})
</script>
