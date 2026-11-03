import { easeOut, type Point } from '@/components/common/lineArt/lineFigure'
import type { WaveLine, WaveLineKind } from './waveArt'

/**
 * How the cover's wave comes alive: drawn on slowly before the orca leaps out of it (the sea at
 * its foot first, then the crests, then the swells running on to the left), then the swells keep
 * moving through the sea lines and spray keeps leaping off the crests and where the orca broke
 * the water. All of it is a function of time, so a still cover is simply time frozen.
 */

/** When each kind of line starts (s), the gap between lines of that kind and how long each takes. */
const DRAW: Record<WaveLineKind, { from: number; stagger: number; duration: number }> = {
  sea: { from: 0, stagger: 0.14, duration: 2.2 },
  crest: { from: 0.4, stagger: 0.18, duration: 1.9 },
  reach: { from: 1, stagger: 0.28, duration: 2.8 },
}

/** s after the wave starts that the orca starts to be drawn: it leaves the water once the sea is there. */
export const ORCA_FROM = 1.6

/** Share (0..1, eased) of each line drawn `elapsed` s after the wave started, for the lines in order. */
export function waveDrawn(lines: readonly WaveLine[], elapsed: number): number[] {
  const seen: Record<WaveLineKind, number> = { sea: 0, crest: 0, reach: 0 }
  return lines.map(({ kind }) => {
    const { from, stagger, duration } = DRAW[kind]
    return easeOut((elapsed - from - stagger * seen[kind]++) / duration)
  })
}

/** s until the whole wave is drawn. */
export function waveDrawSeconds(lines: readonly WaveLine[]): number {
  const count: Record<WaveLineKind, number> = { sea: 0, crest: 0, reach: 0 }
  lines.forEach(({ kind }) => count[kind]++)
  return Math.max(...(Object.keys(DRAW) as WaveLineKind[]).map((k) => (count[k] ? DRAW[k].from + DRAW[k].stagger * (count[k] - 1) + DRAW[k].duration : 0)))
}

const SWELL = { amplitude: 3.5, wavelength: 180, period: 5.2 } // artwork units, artwork units, s

/** Vertical offset (artwork units) of a sea line point at `x`: a swell travelling to the right. Crests hold still. */
export function swell(kind: WaveLineKind, line: number, x: number, time: number): number {
  if (kind === 'crest') return 0
  return SWELL.amplitude * Math.sin((x / SWELL.wavelength) * Math.PI * 2 - (time / SWELL.period) * Math.PI * 2 + line * 1.3)
}

export interface Drop {
  x: number
  y: number
  /** 0..1 */
  alpha: number
  /** Radius in page px. */
  radius: number
}

interface Spray {
  origin: Point
  /** Launch velocity, artwork units per s. */
  vx: number
  vy: number
  period: number
  phase: number
  life: number
  radius: number
}

/** Where spray leaps off: the main crest's lip, the right curl's lip, and the wave foot where the orca breaks out. */
const SPRAY_ORIGINS: readonly { at: Point; drops: number; up: number; spread: number }[] = [
  { at: [347, 57], drops: 6, up: 120, spread: 90 },
  { at: [375, 52], drops: 4, up: 100, spread: 70 },
  { at: [40, 330], drops: 7, up: 150, spread: 110 },
]
const GRAVITY = 260 // artwork units / s²
const SPRAY_FADE_IN = 1.2 // s

function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const SPRAY: readonly Spray[] = (() => {
  const random = seeded(20261104)
  return SPRAY_ORIGINS.flatMap(({ at, drops, up, spread }) =>
    Array.from({ length: drops }, () => ({
      origin: [at[0] + (random() - 0.5) * 16, at[1] + (random() - 0.5) * 10] as Point,
      vx: (random() - 0.5) * spread,
      vy: -up * (0.55 + random() * 0.45),
      period: 1.9 + random() * 1.6,
      phase: random() * 4,
      life: 0.9 + random() * 0.5,
      radius: 1 + random() * 1.3,
    })),
  )
})()

/**
 * The spray at `time` s, `shown` s after it started showing (it fades in), in artwork units;
 * drops between leaps are left out.
 */
export function sprayAt(time: number, shown: number): Drop[] {
  const fade = Math.min(1, Math.max(0, shown / SPRAY_FADE_IN))
  if (fade <= 0) return []
  const drops: Drop[] = []
  for (const s of SPRAY) {
    const age = (time + s.phase) % s.period
    if (age >= s.life) continue
    drops.push({
      x: s.origin[0] + s.vx * age,
      y: s.origin[1] + s.vy * age + 0.5 * GRAVITY * age * age,
      alpha: Math.sin((age / s.life) * Math.PI) * fade,
      radius: s.radius,
    })
  }
  return drops
}
