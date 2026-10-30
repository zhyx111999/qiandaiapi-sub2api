/**
 * Where the site nav (首页 / 平台 / 模型广场) stands. The cover and the model plaza have their own
 * routes; everything shown in a console layout is the platform.
 */
export type SiteSection = 'home' | 'platform' | 'plaza'

export function siteSection(path: string): SiteSection {
  if (path === '/home') return 'home'
  if (path === '/model-plaza') return 'plaza'
  return 'platform'
}

/** The nav shows on the cover, the model plaza and every console page; not on sign-in or setup pages. */
export function siteNavVisible(path: string, consoleMounted: boolean): boolean {
  return path === '/home' || path === '/model-plaza' || consoleMounted
}

/**
 * Whether the nav must fall back to icons: centred in the viewport with its full labels, it would
 * reach within `gap` px of the console toolbar on its right.
 */
export function needsCompact(viewportWidth: number, fullWidth: number, toolbarLeft: number | null, gap = 16): boolean {
  if (toolbarLeft === null) return false
  return viewportWidth / 2 + fullWidth / 2 + gap > toolbarLeft
}
