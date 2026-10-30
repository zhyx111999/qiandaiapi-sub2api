import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * How many console layouts are mounted. Every routed console view mounts its own AppLayout; the
 * site nav uses this to know a console page is on screen, whatever its route.
 */
export const consoleLayouts = ref(0)

/** Counts the calling component's lifetime as a console layout on screen. */
export function useConsolePresence(): void {
  onMounted(() => {
    consoleLayouts.value++
  })
  onBeforeUnmount(() => {
    consoleLayouts.value = Math.max(0, consoleLayouts.value - 1)
  })
}
