import { onBeforeUnmount, watch, type Ref } from 'vue'
import { attachRefraction, type RefractionController } from './refraction'

const SURFACES = '.card, .stat-card, .glass-card, .card-glass'

/** Enhance the existing panel vocabulary without replacing any business component.
 * Only outer surfaces get a lens: a table's mobile rows or nested statistic cells
 * already sit on glass and should not repeatedly refract their parent panel. */
export function observeGlassSurfaces(root: HTMLElement): () => void {
  const attached = new Map<HTMLElement, RefractionController | null>()
  let frame = 0

  function reconcile() {
    frame = 0
    const candidates = new Set(
      Array.from(root.querySelectorAll<HTMLElement>(SURFACES)).filter((el) => {
        const parent = el.parentElement?.closest(SURFACES)
        return !parent || !root.contains(parent)
      }),
    )
    for (const [el, controller] of attached) {
      if (!candidates.has(el)) {
        controller?.destroy()
        attached.delete(el)
      }
    }
    for (const el of candidates) {
      if (attached.has(el)) continue
      // Explicit v-liquid-glass controls own their own lifetime.
      if (el.style.backdropFilter?.includes('liquid-glass-refraction-')) continue
      attached.set(el, attachRefraction(el, { scale: 16, aberration: 0, mode: 'symmetric' }))
    }
  }

  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(reconcile)
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  reconcile()

  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    for (const controller of attached.values()) controller?.destroy()
    attached.clear()
  }
}

/** Same homepage material + refraction on native console/auth panels, including async charts. */
export function useGlassSurfaces(root: Ref<HTMLElement | null>): void {
  const stop = watch(root, (element, _previous, onCleanup) => {
    if (element) onCleanup(observeGlassSurfaces(element))
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(stop)
}
