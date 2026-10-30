/**
 * Which controls the toolbar capsule visits. The toolbar holds the official controls (model
 * plaza, language, the user menu, ...); each is a trigger link or button, and some open a popover
 * next to it (absolutely positioned, or the `.dropdown` menu). Items inside popovers are not
 * toolbar controls.
 */
const POPOVER = (el: Element) => el.classList.contains('absolute') || el.classList.contains('dropdown') || el.getAttribute('role') === 'menu'

/** Links and buttons of the toolbar itself, in document order (not inside any of its popovers). */
export function toolbarTargets(toolbar: HTMLElement): HTMLElement[] {
  return [...toolbar.querySelectorAll<HTMLElement>('a[href], button')].filter((el) => {
    for (let node = el.parentElement; node && node !== toolbar; node = node.parentElement) {
      if (POPOVER(node)) return false
    }
    return true
  })
}

/** True when the popover beside `target` (a sibling inside the same wrapper) is open. */
function popoverOpen(target: HTMLElement): boolean {
  const wrapper = target.parentElement
  if (!wrapper) return false
  return [...wrapper.children].some((child) => child !== target && POPOVER(child))
}

/**
 * Where the capsule rests while the pointer is elsewhere: the trigger whose popover is open,
 * else the link of the current route, else nowhere (the capsule fades out).
 */
export function restTarget(targets: HTMLElement[]): HTMLElement | null {
  return targets.find(popoverOpen) ?? targets.find((el) => el.classList.contains('router-link-active')) ?? null
}
