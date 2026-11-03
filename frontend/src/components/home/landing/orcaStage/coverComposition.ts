import { placementMatrix, applyAffine, type Placement, type Stroke } from '@/components/common/lineArt/lineFigure'
import { ORCA_TAIL_TIP, ORCA_VIEWBOX } from '@/components/common/lineArt/orcaArt'
import { WAVE_LEAP_POINT, WAVE_VIEWBOX } from './waveArt'

/**
 * The cover's picture around the wordmark: a breaking wave at its lower right whose swells run on
 * under it, and the orca leaping out of the wave's foot, up and to the left, behind the glass
 * letters, its head and fin clear above them.
 */

/** Glyph band of the wordmark, page px. */
export interface TextBox {
  left: number
  right: number
  top: number
  bottom: number
}

export interface CoverComposition {
  wave: Placement
  orca: Placement
}

/**
 * Sizes as shares of the wordmark width, offsets in font sizes, the leap angle in degrees (head
 * up). Phones get a larger picture: the wordmark is small there and the screen tall.
 */
const WIDE = { wave: 0.4, waveRight: 0.45, waveBase: 0.95, orca: 0.6, angle: 24 } as const
const NARROW = { wave: 0.5, waveRight: 0.25, waveBase: 1.2, orca: 0.72, angle: 26 } as const
const NARROW_BELOW = 760 // px viewport width
const MARGIN = 8 // px kept clear at the viewport's side edges

function extent(strokes: readonly Stroke[], placement: Placement) {
  const m = placementMatrix(placement)
  let minX = Infinity
  let minY = Infinity
  for (const s of strokes) {
    for (let i = 0; i < s.xs.length; i++) {
      const [x, y] = applyAffine(m, s.xs[i], s.ys[i])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
    }
  }
  return { minX, minY }
}

/**
 * Places the wave and the orca for a wordmark at `text` set in `fontSize` px, in a viewport
 * `width` px wide. The orca stays below `artTop` (clear of the header) and inside the viewport:
 * when it would not, it shrinks about its tail, which stays in the water.
 */
export function coverComposition(text: TextBox, fontSize: number, width: number, artTop: number, orca: readonly Stroke[]): CoverComposition {
  const p = width < NARROW_BELOW ? NARROW : WIDE
  const textWidth = text.right - text.left
  const wave: Placement = {
    x: Math.min(width - MARGIN, text.right + p.waveRight * fontSize),
    y: text.bottom + p.waveBase * fontSize,
    anchor: [WAVE_VIEWBOX.width, WAVE_VIEWBOX.height],
    scale: (p.wave * textWidth) / WAVE_VIEWBOX.width,
    angle: 0,
  }
  const [x, y] = applyAffine(placementMatrix(wave), WAVE_LEAP_POINT[0], WAVE_LEAP_POINT[1])
  const leap: Placement = { x, y, anchor: ORCA_TAIL_TIP, scale: (p.orca * textWidth) / ORCA_VIEWBOX.width, angle: p.angle, mirror: true }
  const { minX, minY } = extent(orca, leap)
  const shrink = Math.min(1, minY < artTop ? (y - artTop) / (y - minY) : 1, minX < MARGIN ? (x - MARGIN) / (x - minX) : 1)
  return { wave, orca: { ...leap, scale: leap.scale * Math.max(0, shrink) } }
}
