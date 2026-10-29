<template>
  <!-- Hidden until the check-in sidecar answers, so the official profile page is unchanged without it. -->
  <div v-if="status" class="card" data-testid="daily-checkin-card">
    <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white">
        {{ t('checkin.title') }}
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {{ t('checkin.description', { min: formatCurrency(status.reward_min), max: formatCurrency(status.reward_max) }) }}
      </p>
    </div>

    <div class="space-y-6 px-6 py-6">
      <p v-if="!status.enabled" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('checkin.disabled') }}
      </p>
      <div v-else class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-base font-medium text-gray-900 dark:text-white">
            {{ status.checked_in ? t('checkin.doneToday', { amount: formatCurrency(status.reward_amount) }) : t('checkin.readyToday') }}
          </p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('checkin.nextReset', { time: nextResetLabel }) }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="daily-checkin-button"
          :disabled="status.checked_in || checkingIn"
          @click="handleCheckIn"
        >
          {{ checkingIn ? t('checkin.checkingIn') : status.checked_in ? t('checkin.checkedIn') : t('checkin.checkIn') }}
        </button>
      </div>

      <div
        v-if="status.is_admin"
        class="space-y-4 border-t border-gray-100 pt-6 dark:border-dark-700"
        data-testid="daily-checkin-admin"
      >
        <div>
          <h3 class="text-base font-medium text-gray-900 dark:text-white">
            {{ t('checkin.admin.title') }}
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('checkin.admin.description') }}
          </p>
        </div>

        <div class="flex items-center justify-between">
          <span class="input-label mb-0">{{ t('checkin.admin.enabled') }}</span>
          <label class="relative inline-flex cursor-pointer items-center">
            <input v-model="form.enabled" type="checkbox" class="peer sr-only" data-testid="daily-checkin-enabled" />
            <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:bg-gray-700 dark:after:border-gray-600 dark:peer-focus:ring-primary-800"></div>
          </label>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="input-label" for="daily-checkin-min">{{ t('checkin.admin.min') }}</label>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">🍃</span>
              <input id="daily-checkin-min" v-model.number="form.reward_min" type="number" min="0.01" step="0.01" class="input flex-1" />
            </div>
          </div>
          <div>
            <label class="input-label" for="daily-checkin-max">{{ t('checkin.admin.max') }}</label>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">🍃</span>
              <input id="daily-checkin-max" v-model.number="form.reward_max" type="number" min="0.01" step="0.01" class="input flex-1" />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs" :class="rangeValid ? 'text-gray-400' : 'text-red-500'">
            {{ rangeValid ? t('checkin.admin.hint') : t('checkin.admin.invalidRange') }}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            data-testid="daily-checkin-save"
            :disabled="saving || !rangeValid"
            @click="handleSave"
          >
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { checkinAPI, type CheckinSettings, type CheckinStatus } from '@/api/checkin'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { formatCurrency } from '@/utils/format'

const { t, locale } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const status = ref<CheckinStatus | null>(null)
const checkingIn = ref(false)
const saving = ref(false)
const form = reactive<CheckinSettings>({ enabled: false, reward_min: 0, reward_max: 0 })

const toCents = (amount: number) => Math.round(Number(amount) * 100)
const rangeValid = computed(() => toCents(form.reward_min) > 0 && toCents(form.reward_max) >= toCents(form.reward_min))

const nextResetLabel = computed(() => {
  if (!status.value) return ''
  return new Date(status.value.next_reset_at).toLocaleString(locale.value, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

function applyStatus(next: CheckinStatus) {
  status.value = next
  form.enabled = next.enabled
  form.reward_min = next.reward_min
  form.reward_max = next.reward_max
}

async function load() {
  try {
    applyStatus(await checkinAPI.getStatus())
  } catch {
    // Sidecar unreachable: keep the current view (hidden if it never loaded).
  }
}

async function handleCheckIn() {
  checkingIn.value = true
  try {
    const result = await checkinAPI.checkIn()
    appStore.showSuccess(t('checkin.success', { amount: formatCurrency(result.reward_amount) }))
    authStore.refreshUser().catch(() => undefined)
  } catch (err) {
    appStore.showError(extractI18nErrorMessage(err, t, 'checkin.errors', t('checkin.failed')))
  } finally {
    await load()
    checkingIn.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await checkinAPI.updateSettings({ ...form })
    appStore.showSuccess(t('common.saved'))
    await load()
  } catch (err) {
    appStore.showError(extractI18nErrorMessage(err, t, 'checkin.errors', t('common.error')))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
