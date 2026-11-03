<template>
  <fieldset
    v-if="visible"
    class="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-600"
    data-testid="account-status-check-section"
  >
    <legend class="px-1 text-sm font-medium text-gray-900 dark:text-white">{{ t('accountStatusCheck.title') }}</legend>
    <p v-if="loading" class="input-hint">{{ t('accountStatusCheck.loading') }}</p>
    <p v-else-if="loadError" role="alert" class="text-sm text-red-600 dark:text-red-400" data-testid="account-status-check-load-error">
      {{ t('accountStatusCheck.errors.loadFailed', { reason: loadError }) }}
    </p>
    <p v-else-if="!form?.editing" class="input-hint" data-testid="account-status-check-create-required">
      {{ t('accountStatusCheck.createHint') }}
    </p>
    <template v-else-if="draft">
      <p v-if="readOnly" class="input-hint" data-testid="account-status-check-inherited">
        {{ t('accountStatusCheck.inheritedHint') }}
      </p>
      <fieldset :disabled="readOnly" class="space-y-3" data-testid="account-status-check-fields">
        <div class="flex items-center justify-between gap-4">
          <p :id="`${uid}-hint`" class="input-hint mt-0">{{ t('accountStatusCheck.enableHint') }}</p>
          <Toggle
            v-model="draft.enabled"
            data-testid="account-status-check-toggle"
            :aria-label="t('accountStatusCheck.title')"
            :aria-describedby="`${uid}-hint`"
          />
        </div>
        <p v-if="pendingAuto" class="input-hint" data-testid="account-status-check-pending">
          {{ t('accountStatusCheck.pendingHint') }}
        </p>

        <div v-if="draft.enabled" class="space-y-3 border-t border-gray-100 pt-3 dark:border-dark-700" data-testid="account-status-check-check">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ t('accountStatusCheck.title') }}</p>
            <p class="input-hint mt-0.5">{{ t('accountStatusCheck.checkHint') }}</p>
          </div>
          <div class="flex items-center justify-between gap-4">
            <label :id="`${uid}-auto`" class="input-label mb-0">{{ t('accountStatusCheck.autoCheck') }}</label>
            <Toggle v-model="draft.check_enabled" data-testid="account-status-check-check-toggle" :aria-labelledby="`${uid}-auto`" />
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label :id="`${uid}-close`" class="input-label mb-0">{{ t('accountStatusCheck.disableOnDegraded') }}</label>
              <p class="input-hint mt-0.5">{{ t('accountStatusCheck.disableOnDegradedHint') }}</p>
            </div>
            <Toggle v-model="draft.disable_on_degraded" data-testid="account-status-check-disable-on-degraded" :aria-labelledby="`${uid}-close`" />
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <label :id="`${uid}-reopen`" class="input-label mb-0">{{ t('accountStatusCheck.reopenOnRecovered') }}</label>
              <p class="input-hint mt-0.5">{{ t('accountStatusCheck.reopenOnRecoveredHint') }}</p>
            </div>
            <Toggle v-model="draft.reopen_on_recovered" data-testid="account-status-check-reopen-on-recovered" :aria-labelledby="`${uid}-reopen`" />
          </div>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div>
              <label :for="`${uid}-interval`" class="input-label">{{ t('accountStatusCheck.interval') }}</label>
              <input
                :id="`${uid}-interval`"
                v-model.number="draft.interval_minutes"
                type="number"
                step="1"
                :min="limits.interval_min"
                :max="limits.interval_max"
                class="input"
                data-testid="account-status-check-interval"
                @change="form?.normalizeDraft()"
              />
              <p class="input-hint">{{ t('accountStatusCheck.range', { min: limits.interval_min, max: limits.interval_max }) }}</p>
            </div>
            <div>
              <label :for="`${uid}-model`" class="input-label">{{ t('accountStatusCheck.model') }}</label>
              <input
                :id="`${uid}-model`"
                v-model="draft.model"
                type="text"
                class="input"
                :placeholder="defaultModel"
                autocomplete="off"
                data-testid="account-status-check-model"
                @change="form?.normalizeDraft()"
              />
              <p class="input-hint">{{ t('accountStatusCheck.modelHint') }}</p>
            </div>
            <div>
              <label :for="`${uid}-effort`" class="input-label">{{ t('accountStatusCheck.effort') }}</label>
              <select :id="`${uid}-effort`" v-model="draft.reasoning_effort" class="input" data-testid="account-status-check-effort">
                <option v-for="effort in efforts" :key="effort" :value="effort">{{ effort }}</option>
              </select>
            </div>
            <div>
              <label :for="`${uid}-timeout`" class="input-label">{{ t('accountStatusCheck.timeout') }}</label>
              <input
                :id="`${uid}-timeout`"
                v-model.number="draft.timeout_seconds"
                type="number"
                step="1"
                :min="limits.timeout_min"
                :max="limits.timeout_max"
                class="input"
                data-testid="account-status-check-timeout"
                @change="form?.normalizeDraft()"
              />
              <p class="input-hint">{{ t('accountStatusCheck.range', { min: limits.timeout_min, max: limits.timeout_max }) }}</p>
            </div>
          </div>
          <p v-if="saved?.configured && !saved.effective_model" class="input-hint" data-testid="account-status-check-no-model">
            {{ t('accountStatusCheck.noModelHint') }}
          </p>
          <p v-if="form?.canRunNow.value" class="input-hint">{{ t('accountStatusCheck.runSavedHint') }}</p>
          <button
            v-if="form?.canRunNow.value"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="form.running.value"
            data-testid="account-status-check-run"
            @click="form.runNow()"
          >
            {{ t('accountStatusCheck.runNow') }}
          </button>
        </div>
      </fieldset>
    </template>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import { injectAccountStatusCheckForm } from './useAccountStatusCheckForm'

const { t } = useI18n()
const uid = useId()
const form = injectAccountStatusCheckForm()

const visible = computed(() => form?.visible.value === true)
const loading = computed(() => form?.loading.value === true)
const loadError = computed(() => form?.loadError.value ?? '')
const draft = computed(() => form?.draft.value ?? null)
const caps = computed(() => form?.capabilities.value ?? null)
const limits = computed(() => caps.value?.limits ?? { interval_min: 1, interval_max: 1, timeout_min: 1, timeout_max: 1 })
const efforts = computed(() => caps.value?.efforts ?? [])
const saved = computed(() => form?.saved.value ?? null)
const pendingAuto = computed(() => form?.editing === true && saved.value?.configured === false)
const defaultModel = computed(() => saved.value?.effective_model || t('accountStatusCheck.defaultModel'))
const readOnly = computed(() => form?.readOnly.value === true)
</script>
