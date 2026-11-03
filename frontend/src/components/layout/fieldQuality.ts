import { ref } from 'vue'

/*
 * How much of the console field a device can afford, decided from the frames it actually delivers
 * (as iOS scales Liquid Glass back on devices and modes that cannot keep up). Every device starts
 * with the full field; one whose frames stay slow while the field runs steps down, first to a
 * lower-resolution canvas (on high-density screens), then to a still field. The glass, the capsules
 * and the rim light stay in every step; on the still step nothing moves on its own (the rims keep
 * their resting light instead of following the pointer). A step down holds for the tab's session,
 * so later pages start where the device settled instead of stuttering again.
 */
export type FieldQuality = 'full' | 'lowres' | 'still'

const QUALITIES: readonly FieldQuality[] = ['full', 'lowres', 'still']

/** The steps a device can take: the low-resolution one only exists on high-density screens. */
export const qualitySteps = (dpr: number): FieldQuality[] => (dpr > 1 ? ['full', 'lowres', 'still'] : ['full', 'still'])

export const GOVERNOR = {
  /** Frames ignored after the field (re)starts: page rendering and data loading settle first. */
  warmup: 90,
  /** Frames per verdict. */
  window: 60,
  /** A window is slow when its median frame takes longer than this (about 42 fps). */
  slowMs: 24,
  /** Consecutive slow windows before stepping down. */
  confirm: 2,
  /** Gaps longer than this are pauses (hidden tab, debugger), not slow frames. */
  pauseMs: 250,
} as const

export interface Governor {
  /** Feeds one frame interval (ms); returns the next step when the device should step down. */
  record(intervalMs: number): FieldQuality | null
}

export function createGovernor(start: FieldQuality, steps: FieldQuality[], g = GOVERNOR): Governor {
  let level = Math.max(0, steps.indexOf(start))
  let skip = g.warmup
  let strikes = 0
  let samples: number[] = []
  return {
    record(intervalMs) {
      if (level >= steps.length - 1 || intervalMs <= 0 || intervalMs > g.pauseMs) return null
      if (skip > 0) {
        skip--
        return null
      }
      samples.push(intervalMs)
      if (samples.length < g.window) return null
      const sorted = [...samples].sort((a, b) => a - b)
      const median = sorted[sorted.length >> 1]
      samples = []
      strikes = median > g.slowMs ? strikes + 1 : 0
      if (strikes < g.confirm) return null
      strikes = 0
      skip = g.warmup // let the lighter step settle before judging it
      level++
      return steps[level]
    },
  }
}

const STORAGE_KEY = 'qiandai:field-quality'

/** The step this tab settled on earlier, or the full field. */
export function savedQuality(): FieldQuality {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY) as FieldQuality | null
    return saved && QUALITIES.includes(saved) ? saved : 'full'
  } catch {
    return 'full'
  }
}

/** The step this tab is on, shared by the field (which judges it) and the light (which follows it). */
export const fieldQuality = ref<FieldQuality>(typeof window === 'undefined' ? 'full' : savedQuality())

/** Moves the tab to `quality` and remembers it for its later pages. */
export function setFieldQuality(quality: FieldQuality): void {
  fieldQuality.value = quality
  try {
    sessionStorage.setItem(STORAGE_KEY, quality)
  } catch {
    // Without storage the next page simply judges again.
  }
}
