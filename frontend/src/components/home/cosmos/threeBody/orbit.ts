/**
 * Equal-mass figure-eight solution of the planar three-body problem
 * (Chenciner & Montgomery, 2000) with G = m = 1.
 *
 * One period is integrated once with RK4 and stored as a lookup table, so
 * playback stays on the periodic orbit forever instead of drifting into the
 * chaotic regime that a long-running live integration would reach.
 */

export const BODY_COUNT = 3
/** Interleaved [x0, y0, x1, y1, x2, y2]. */
export type BodyVector = Float64Array

export const FIGURE_EIGHT_PERIOD = 6.32591398

const INITIAL_POSITIONS = [0.97000436, -0.24308753, -0.97000436, 0.24308753, 0, 0]
const INITIAL_VELOCITIES = [0.466203685, 0.43236573, 0.466203685, 0.43236573, -0.93240737, -0.86473146]

export interface OrbitTable {
  /** `count` samples of interleaved body positions over exactly one period. */
  readonly samples: Float64Array
  readonly count: number
}

export function initialState(): { positions: BodyVector; velocities: BodyVector } {
  return { positions: Float64Array.from(INITIAL_POSITIONS), velocities: Float64Array.from(INITIAL_VELOCITIES) }
}

/** Newtonian accelerations for unit masses. */
export function accelerations(positions: BodyVector, out: BodyVector): BodyVector {
  out.fill(0)
  for (let i = 0; i < BODY_COUNT; i++) {
    for (let j = i + 1; j < BODY_COUNT; j++) {
      const dx = positions[2 * j] - positions[2 * i]
      const dy = positions[2 * j + 1] - positions[2 * i + 1]
      const r2 = dx * dx + dy * dy
      const inv = 1 / (r2 * Math.sqrt(r2))
      out[2 * i] += dx * inv
      out[2 * i + 1] += dy * inv
      out[2 * j] -= dx * inv
      out[2 * j + 1] -= dy * inv
    }
  }
  return out
}

/** Preallocated RK4 stage buffers: position derivatives are velocities, velocity derivatives are accelerations. */
interface Rk4Scratch {
  k2p: BodyVector
  k3p: BodyVector
  k4p: BodyVector
  k1v: BodyVector
  k2v: BodyVector
  k3v: BodyVector
  k4v: BodyVector
  probe: BodyVector
}

function createScratch(size: number): Rk4Scratch {
  const make = () => new Float64Array(size)
  return { k2p: make(), k3p: make(), k4p: make(), k1v: make(), k2v: make(), k3v: make(), k4v: make(), probe: make() }
}

/** Classic RK4 step on (positions, velocities), in place. */
function rk4Step(p: BodyVector, v: BodyVector, h: number, s: Rk4Scratch): void {
  const n = p.length

  accelerations(p, s.k1v)
  for (let i = 0; i < n; i++) {
    s.k2p[i] = v[i] + 0.5 * h * s.k1v[i]
    s.probe[i] = p[i] + 0.5 * h * v[i]
  }
  accelerations(s.probe, s.k2v)
  for (let i = 0; i < n; i++) {
    s.k3p[i] = v[i] + 0.5 * h * s.k2v[i]
    s.probe[i] = p[i] + 0.5 * h * s.k2p[i]
  }
  accelerations(s.probe, s.k3v)
  for (let i = 0; i < n; i++) {
    s.k4p[i] = v[i] + h * s.k3v[i]
    s.probe[i] = p[i] + h * s.k3p[i]
  }
  accelerations(s.probe, s.k4v)
  for (let i = 0; i < n; i++) {
    p[i] += (h / 6) * (v[i] + 2 * s.k2p[i] + 2 * s.k3p[i] + s.k4p[i])
    v[i] += (h / 6) * (s.k1v[i] + 2 * s.k2v[i] + 2 * s.k3v[i] + s.k4v[i])
  }
}

/** Integrates one full period into a lookup table. */
export function integrateFigureEight(count = 4096, substeps = 8): OrbitTable {
  const { positions, velocities } = initialState()
  const stride = BODY_COUNT * 2
  const samples = new Float64Array(count * stride)
  const scratch = createScratch(stride)
  const h = FIGURE_EIGHT_PERIOD / (count * substeps)

  for (let s = 0; s < count; s++) {
    samples.set(positions, s * stride)
    for (let k = 0; k < substeps; k++) rk4Step(positions, velocities, h, scratch)
  }
  return { samples, count }
}

/** Writes interpolated body positions at `phase` (any real; one unit = one period) into `out`. */
export function sampleOrbit(table: OrbitTable, phase: number, out: BodyVector): BodyVector {
  const stride = BODY_COUNT * 2
  const t = (phase - Math.floor(phase)) * table.count
  const i0 = Math.floor(t) % table.count
  const i1 = (i0 + 1) % table.count
  const f = t - Math.floor(t)
  for (let k = 0; k < stride; k++) {
    const a = table.samples[i0 * stride + k]
    const b = table.samples[i1 * stride + k]
    out[k] = a + (b - a) * f
  }
  return out
}
