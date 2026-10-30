import { onBeforeUnmount, ref } from 'vue'

/**
 * How many console layouts are on screen. Every routed console view mounts its own AppLayout; the
 * site nav uses this to know a console page is showing, whatever its route.
 */
export const consoleLayouts = ref(0)

/**
 * Counts the calling component as a console layout on screen. Counted from setup, not from
 * mounted: a page switch unmounts the old view and sets up the new one inside the router view's
 * update, which runs before the site nav's (created earlier), so the nav never sees a gap.
 */
export function useConsolePresence(): void {
  consoleLayouts.value++
  onBeforeUnmount(() => {
    consoleLayouts.value = Math.max(0, consoleLayouts.value - 1)
  })
}
