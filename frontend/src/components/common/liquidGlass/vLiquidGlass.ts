import type { Directive } from 'vue'
import { attachRefraction, type RefractionController, type RefractionOptions } from './refraction'

export interface LiquidGlassBinding extends RefractionOptions {
  /** Media query the lens is limited to (e.g. desktop only); without it the lens is always on. */
  media?: string
}

type Binding = LiquidGlassBinding | null | undefined

interface Entry {
  lens: RefractionOptions
  controller: RefractionController | null
  query: MediaQueryList | null
  onChange: () => void
}

const entries = new WeakMap<HTMLElement, Entry>()

function split(value: Binding): { lens: RefractionOptions; media?: string } {
  const { media, ...lens } = value ?? {}
  return { lens, media }
}

function sameOptions(a: Binding, b: Binding): boolean {
  return (
    a?.scale === b?.scale &&
    a?.aberration === b?.aberration &&
    a?.mode === b?.mode &&
    a?.edge === b?.edge &&
    a?.media === b?.media
  )
}

/** Attaches or removes the lens so it matches the media query. */
function sync(el: HTMLElement, entry: Entry) {
  const active = !entry.query || entry.query.matches
  if (active && !entry.controller) {
    entry.controller = attachRefraction(el, entry.lens)
  } else if (!active && entry.controller) {
    entry.controller.destroy()
    entry.controller = null
  }
}

function watchMedia(entry: Entry, media: string | undefined) {
  entry.query?.removeEventListener('change', entry.onChange)
  entry.query = media && typeof window.matchMedia === 'function' ? window.matchMedia(media) : null
  entry.query?.addEventListener('change', entry.onChange)
}

/**
 * Adds the refraction layer to an element that already carries a `liquid-glass` class.
 * Usage: `<nav class="liquid-glass" v-liquid-glass="{ scale: 28, media: '(min-width: 1024px)' }">`
 */
export const vLiquidGlass: Directive<HTMLElement, Binding> = {
  mounted(el, { value }) {
    const { lens, media } = split(value)
    const entry: Entry = { lens, controller: null, query: null, onChange: () => sync(el, entry) }
    entries.set(el, entry)
    watchMedia(entry, media)
    sync(el, entry)
  },
  updated(el, { value, oldValue }) {
    const entry = entries.get(el)
    if (!entry || sameOptions(value, oldValue)) return
    const { lens, media } = split(value)
    entry.lens = lens
    if (media !== oldValue?.media) watchMedia(entry, media)
    const current = entry.controller
    sync(el, entry)
    // A lens that stayed attached takes the new options; a newly attached one already has them.
    if (current && entry.controller === current) current.update(lens)
  },
  beforeUnmount(el) {
    const entry = entries.get(el)
    if (!entry) return
    watchMedia(entry, undefined)
    entry.controller?.destroy()
    entries.delete(el)
  }
}
