import { reactive } from 'vue'

/**
 * Layout facts shared by the site nav and the console top bar. Each publishes what it measures of
 * itself, so neither reaches into the other's markup: the top bar keeps its page title clear of
 * the nav, and the nav falls back to icons when its labels would reach the toolbar.
 */
export const siteNavLayout = reactive({
  /** Half the nav's width while it sits at the top centre (0 when hidden or at the bottom). */
  navHalf: 0,
  /** Left edge of the console toolbar on screen (null when no console top bar is mounted). */
  toolbarLeft: null as number | null,
})
