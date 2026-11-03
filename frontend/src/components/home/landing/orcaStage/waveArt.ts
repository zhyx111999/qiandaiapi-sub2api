import { smoothPolyline, strokeFromPoints, type Point, type Stroke } from '@/components/common/lineArt/lineFigure'

/**
 * The cover's breaking wave, a line drawing like the orca: one line along the middle of each band
 * of "Big Wave (#2)" by oksmith (Openclipart #315522, a remix of "waves - lineart" by frankes,
 * Openclipart #215311), both released into the public domain (CC0 1.0); see
 * assets/brand/Openclipart-NOTICE.txt. The band centrelines were traced once from the artwork and
 * are smoothed here; three long swells continue the sea to the left, under the wordmark.
 */

/** Size of the artwork's coordinate space. */
export const WAVE_VIEWBOX = { width: 515, height: 497 } as const

/** Wave foot where the orca leaves the water, artwork units. */
export const WAVE_LEAP_POINT: Point = [40, 330]

/**
 * crest: the breaking crests and their curls; sea: the swells at the foot of the wave;
 * reach: the swells running on to the left, fading out.
 */
export type WaveLineKind = 'crest' | 'sea' | 'reach'

export interface WaveLine {
  kind: WaveLineKind
  stroke: Stroke
}

/** Traced centrelines (x, y pairs), each starting where it is drawn from: crests at their foot, swells at the left. */
const TRACED: readonly { kind: 'crest' | 'sea'; points: readonly number[] }[] = [
  // crest outer arch
  { kind: 'crest', points: [27.5, 297, 24, 293.5, 25, 287, 34.5, 266.5, 65, 209, 103, 146, 131, 105, 151, 78, 172, 56, 193, 37, 210, 26.5, 236, 16, 258, 11, 286, 10, 305.5, 14.5, 326, 26, 341, 42, 346, 49, 347, 57] },
  // crest arch
  { kind: 'crest', points: [136, 257.5, 141, 203, 145, 187, 151, 168, 162, 145.5, 172, 128, 200, 92.5, 212, 81, 229, 68, 242.5, 61.5, 257.5, 57, 275.5, 55, 289.5, 56, 311, 62, 316, 65, 318.5, 69] },
  // crest inner arch
  { kind: 'crest', points: [202.5, 247.5, 200, 244, 198.5, 224, 199.5, 185, 206.5, 153.5, 212.5, 138, 220, 125, 235, 103.5, 245, 94, 256.5, 86.5, 277, 80, 294.5, 80, 297.5, 82] },
  // crest curl
  { kind: 'crest', points: [235, 171, 242, 151, 253, 133, 270, 116, 279, 110.5] },
  // wave foot
  { kind: 'sea', points: [6, 327, 28, 297, 34.5, 295, 60.5, 280, 80, 271, 84, 267, 97.5, 265.5, 119, 260, 136, 257.5, 163.5, 258.5, 198.5, 262.5, 202, 261] },
  // swell under the crest
  { kind: 'sea', points: [261, 276.5, 290, 299, 324, 322, 354, 339, 369.5, 345, 389, 349.5, 406, 350, 430, 347.5, 446, 342.5, 461, 344] },
  // swell
  { kind: 'sea', points: [17, 349, 18, 344, 39, 326, 62, 312, 82, 302, 118, 291, 138, 288, 159, 287, 194, 292, 217.5, 299, 237, 306.5, 271, 325, 346, 370, 369, 379, 389, 384, 420, 384, 441.5, 379, 457.5, 371, 490.5, 346, 496, 342.5, 501, 341.5] },
  // swell
  { kind: 'sea', points: [12, 407, 13, 402, 31, 381, 46, 369, 63, 359, 80, 352.5, 97, 348, 134, 343, 162.5, 345.5, 188, 353, 207, 360.5, 254, 384, 344, 437, 365, 445, 388, 450.5, 406, 451, 422.5, 450, 448.5, 443, 466, 433.5, 487, 417, 499.5, 404, 504.5, 403] },
  // swell
  { kind: 'sea', points: [24, 453, 25, 447, 37, 435, 54, 423, 66, 417, 90, 408, 110, 403, 129.5, 400.5, 140, 401, 159, 404, 185, 414, 213, 429, 253, 457, 276.5, 471, 291, 478.5, 312.5, 487] },
  // right curl outer
  { kind: 'crest', points: [498, 231, 503, 228, 506, 214, 507, 200.5, 506, 176, 502, 153, 496.5, 134, 481, 102, 468, 86, 458, 75.5, 440, 62, 429.5, 57, 419, 53, 407, 50, 375.5, 51] },
  // right curl
  { kind: 'crest', points: [483, 148, 477, 135.5, 465.5, 123, 447, 109, 436, 103.5, 418.5, 100, 401.5, 100.5, 385, 106, 381.5, 112.5] },
  // right curl inner
  { kind: 'crest', points: [433.5, 325, 426, 323, 408, 302, 393, 275.5, 385, 253, 381.5, 234.5, 381, 211, 385.5, 191.5, 395, 173, 405.5, 162, 418, 156, 427, 155, 436.5, 156, 449, 161, 461.5, 169, 473, 182, 484, 201, 495, 229, 498, 231] },
]

/** The three lowest swells run on to the left: length, amplitude and rise (artwork units). */
const REACH = { length: 720, shrink: 0.18, amplitude: 14, waves: 1.1, rise: 11, samples: 60 } as const
const SMOOTH_STEP = 3 // artwork units between smoothed points

function pairs(flat: readonly number[]): Point[] {
  const out: Point[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

/** A swell continued leftwards from `start`, leaving it level. */
function reachFrom(start: Point, index: number): Point[] {
  const length = REACH.length * (1 - REACH.shrink * index)
  const points: Point[] = []
  for (let k = 0; k <= REACH.samples; k++) {
    const t = k / REACH.samples
    const swell = Math.sin(t * Math.PI * 2 * REACH.waves + index) - Math.sin(index)
    points.push([start[0] - t * length, start[1] + swell * REACH.amplitude - t * REACH.rise])
  }
  return points
}

let lines: WaveLine[] | null = null

/** The wave's lines in drawing order (built once). */
export function waveLines(): WaveLine[] {
  if (lines) return lines
  const traced = TRACED.map(({ kind, points }) => ({ kind, points: smoothPolyline(pairs(points), SMOOTH_STEP) }))
  const lowest = traced.filter((line) => line.kind === 'sea').slice(-3)
  lines = [
    ...traced.map(({ kind, points }) => ({ kind, stroke: strokeFromPoints(points) })),
    ...lowest.map((line, i) => ({ kind: 'reach' as const, stroke: strokeFromPoints(reachFrom(line.points[0], i)) })),
  ]
  return lines
}
