import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Drives a page that refreshes itself on the cadence the server data asks for.
 * `now` ticks every second for the countdown and for judging how fresh a probe is.
 * A hidden tab skips its refresh.
 */
export function useRefreshClock(refresh: () => void) {
  const now = ref(Date.now())
  const nextAt = ref(0)
  let refreshTimer: ReturnType<typeof setInterval> | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined

  const countdown = computed(() => Math.max(0, Math.ceil((nextAt.value - now.value) / 1000)))

  function schedule(seconds: number) {
    clearInterval(refreshTimer)
    now.value = Date.now()
    nextAt.value = now.value + seconds * 1000
    refreshTimer = setInterval(() => {
      if (!document.hidden) refresh()
    }, seconds * 1000)
  }

  onMounted(() => {
    clockTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })
  onBeforeUnmount(() => {
    clearInterval(refreshTimer)
    clearInterval(clockTimer)
  })

  return { now, countdown, schedule }
}
