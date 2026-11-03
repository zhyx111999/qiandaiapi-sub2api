import { computed, onMounted, ref } from 'vue'
import { getChannelMonitorMode } from '@/utils/featureFlags'
import { getView, setView, type ChannelMonitorViewState, type MonitorView } from './api'

const VIEWS: MonitorView[] = ['v1', 'v2', 'v3', 'v4']

/** i18n key of a view's text. v1–v3 keep the official channelMonitorV3 texts. */
export function monitorModeKey(part: 'modes' | 'admin.description' | 'admin.switchEffect', mode: string): string {
  return `${mode === 'v4' ? 'channelMonitorV4' : 'channelMonitorV3'}.${part}.${mode}`
}

/**
 * The monitor view of the site. Until the server answers (or when it cannot) the saved official mode
 * stands in. `ready` turns true once the question is settled either way.
 */
export function useChannelMonitorView() {
  const state = ref<ChannelMonitorViewState | null>(null)
  const ready = ref(false)
  const view = computed<MonitorView>(() => state.value?.view ?? getChannelMonitorMode())
  const modes = computed<MonitorView[]>(() => VIEWS)

  async function refresh() {
    try {
      state.value = await getView()
    } catch {
      state.value = null
    } finally {
      ready.value = true
    }
  }

  async function apply(mode: MonitorView) {
    state.value = await setView(mode)
  }

  onMounted(refresh)
  return { view, ready, modes, apply }
}
