/**
 * Liquid Glass SVG refraction (Chromium only).
 *
 * Ported to TypeScript from liquid-glass-tailwind `src/refraction.js`
 * https://github.com/iMxSquash/liquid-glass-tailwind
 * MIT License, Copyright (c) 2026 Elwen Coussot
 *
 * Other engines keep the blur + saturate fallback declared in liquidGlass.css.
 * Each element gets its own pixel-sized filter and a canvas-drawn displacement
 * map built from a rounded-rect signed distance field.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFS_ID = 'liquid-glass-defs'
const RESIZE_SETTLE_MS = 120
const CHANNEL_MATRIX = {
  R: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  G: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  B: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
} as const

export type RefractionMode = 'diagonal' | 'symmetric'

export interface RefractionOptions {
  /** Base displacement in px. */
  scale?: number
  /** Per-channel scale spread; 0 keeps a single clean lens pass. */
  aberration?: number
  mode?: RefractionMode
}

export interface RefractionController {
  update(next: RefractionOptions): void
  destroy(): void
}

let uid = 0

function isRefractionSupported(): boolean {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return false
  // Parsing url() alone does not prove that SVG backdrop filters are rendered.
  // Non-Blink browsers keep the regular frosted material instead.
  if (!/(?:Chrome|Chromium|Edg)\/\d/.test(navigator.userAgent)) return false
  const probe = document.createElement('div')
  probe.style.cssText = 'backdrop-filter: url(#probe)'
  return probe.style.backdropFilter === 'url(#probe)' || probe.style.backdropFilter === 'url("#probe")'
}

function prefersOptOut(): boolean {
  return (
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches ||
    window.matchMedia('(prefers-contrast: more)').matches
  )
}

function getDefs(): SVGSVGElement {
  const existing = document.getElementById(DEFS_ID)
  if (existing instanceof SVGSVGElement) return existing
  const defs = document.createElementNS(SVG_NS, 'svg')
  defs.id = DEFS_ID
  defs.setAttribute('width', '0')
  defs.setAttribute('height', '0')
  defs.setAttribute('aria-hidden', 'true')
  defs.setAttribute('focusable', 'false')
  defs.style.position = 'absolute'
  document.body.prepend(defs)
  return defs
}

/** Signed distance to a rounded rectangle centered in (w, h); negative inside. */
function roundedRectSdf(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r)
  const qy = Math.abs(y - h / 2) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * 'diagonal': constant down-right direction, the SDF only shapes the band —
 * glass lit from the top-left. 'symmetric': outward normals on every edge.
 */
function buildDisplacementMap(w: number, h: number, r: number, edge: number, mode: RefractionMode): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(w, h)
  const data = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = -roundedRectSdf(x + 0.5, y + 0.5, w, h, r)
      let nx = 0
      let ny = 0
      if (inside < edge) {
        const t = Math.min(1, Math.max(0, 1 - inside / edge))
        const mag = t * t
        if (mode === 'symmetric') {
          const gx = roundedRectSdf(x + 1.5, y + 0.5, w, h, r) - roundedRectSdf(x - 0.5, y + 0.5, w, h, r)
          const gy = roundedRectSdf(x + 0.5, y + 1.5, w, h, r) - roundedRectSdf(x + 0.5, y - 0.5, w, h, r)
          const len = Math.hypot(gx, gy) || 1
          nx = (gx / len) * mag
          ny = (gy / len) * mag
        } else {
          nx = Math.SQRT1_2 * mag
          ny = Math.SQRT1_2 * mag
        }
      }
      const i = (y * w + x) * 4
      data[i] = Math.round(128 + nx * 127)
      data[i + 1] = Math.round(128 + ny * 127)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

/**
 * Attaches a refraction filter to `el` and keeps it sized with a ResizeObserver.
 * Returns null when unsupported or the user opted out; the CSS fallback then stays in effect.
 */
export function attachRefraction(el: HTMLElement, options: RefractionOptions = {}): RefractionController | null {
  if (!isRefractionSupported() || prefersOptOut()) return null

  const state: Required<RefractionOptions> = {
    scale: options.scale ?? 48,
    aberration: options.aberration ?? 0,
    mode: options.mode ?? 'diagonal',
  }

  const id = `liquid-glass-refraction-${uid++}`
  const defs = getDefs()
  const filter = svg('filter', {
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  })
  const feImage = svg('feImage', { preserveAspectRatio: 'none', result: 'map' })
  const previous = {
    standard: el.style.getPropertyValue('backdrop-filter'),
    webkit: el.style.getPropertyValue('-webkit-backdrop-filter'),
  }
  defs.appendChild(filter)

  let lastW = 0
  let lastH = 0
  let pendingRebuild = 0

  function buildPasses() {
    filter.replaceChildren(feImage)
    const displacement = (scale: number) => svg('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', scale: String(scale),
    })
    if (state.aberration === 0) {
      filter.append(displacement(state.scale))
      return
    }
    // Only prominent controls pay for three-channel chromatic refraction.
    const channels = ['R', 'G', 'B'] as const
    channels.forEach((channel, index) => {
      filter.append(
        displacement(state.scale + (1 - index) * state.aberration),
        svg('feColorMatrix', { values: CHANNEL_MATRIX[channel], result: `chan${channel}` }),
      )
    })
    filter.append(
      svg('feBlend', { in: 'chanR', in2: 'chanG', mode: 'screen', result: 'chanRG' }),
      svg('feBlend', { in: 'chanRG', in2: 'chanB', mode: 'screen' }),
    )
  }

  function rebuild(w: number, h: number) {
    lastW = w
    lastH = h
    const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16, w / 2, h / 2)
    const map = buildDisplacementMap(w, h, radius, Math.min(42, w / 6, h / 6), state.mode)
    if (!map) return
    // Filter region AND primitive coordinates must use the same pixel-sized box.
    // Bounding-box filter units with pixel values cause cropped/tiled backdrop artifacts.
    for (const node of [filter, feImage]) {
      node.setAttribute('x', '0')
      node.setAttribute('y', '0')
      node.setAttribute('width', String(w))
      node.setAttribute('height', String(h))
    }
    feImage.setAttribute('href', map)
    // Frost stays in the CSS chain. An extra SVG Gaussian blur changes the sampling bounds.
    const chain = `blur(var(--glass-blur-refract, 8px)) url("#${id}") saturate(var(--glass-saturate, 160%)) brightness(var(--glass-brightness, 1.04))`
    el.style.setProperty('backdrop-filter', chain)
    el.style.setProperty('-webkit-backdrop-filter', chain)
  }

  function measure() {
    const w = Math.round(el.offsetWidth)
    const h = Math.round(el.offsetHeight)
    if (w <= 0 || h <= 0 || (w === lastW && h === lastH)) return
    if (!lastW) {
      rebuild(w, h)
      return
    }
    // Width transitions (e.g. a collapsing sidebar) resize every frame; rebuild once it settles.
    window.clearTimeout(pendingRebuild)
    pendingRebuild = window.setTimeout(() => {
      const settledW = Math.round(el.offsetWidth)
      const settledH = Math.round(el.offsetHeight)
      if (settledW > 0 && settledH > 0) rebuild(settledW, settledH)
    }, RESIZE_SETTLE_MS)
  }

  buildPasses()
  const observer = new ResizeObserver(measure)
  observer.observe(el)
  measure()

  return {
    update(next) {
      Object.assign(state, next)
      buildPasses()
      if (lastW > 0 && lastH > 0) rebuild(lastW, lastH)
    },
    destroy() {
      observer.disconnect()
      window.clearTimeout(pendingRebuild)
      filter.remove()
      if (!defs.childElementCount) defs.remove()
      el.style.setProperty('backdrop-filter', previous.standard)
      el.style.setProperty('-webkit-backdrop-filter', previous.webkit)
    },
  }
}
