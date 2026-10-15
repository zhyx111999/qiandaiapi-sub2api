import { BODY_COUNT, type BodyVector } from './orbit'

const STIFFNESS = 4.8 // ω² of the restoring spring (ω ≈ 2.2 rad/s)
const DAMPING = 1.55 // 2ζω with ζ ≈ 0.35: a few visible wobbles, settled in ~3 s
const MAX_KICK = 1.6
const ENERGY_DECAY = 1.1 // seconds

/**
 * Click response layered on top of the periodic orbit: each body gets a damped
 * spring offset, so a kick visibly throws the bodies off course and the system
 * then settles back onto the figure-eight instead of collapsing into chaos.
 */
export class OrbitPerturbation {
  private readonly offsets = new Float64Array(BODY_COUNT * 2)
  private readonly velocities = new Float64Array(BODY_COUNT * 2)
  /** 1 right after a click, decaying to 0; drives glow and spin boosts. */
  energy = 0

  /** Pushes bodies away from (px, py) in orbit-plane coordinates. */
  kick(bodies: BodyVector, px: number, py: number, strength = 0.55): void {
    for (let i = 0; i < BODY_COUNT; i++) {
      const dx = bodies[2 * i] - px
      const dy = bodies[2 * i + 1] - py
      const d = Math.hypot(dx, dy) || 1e-6
      const push = Math.min(MAX_KICK, strength / (d * d + 0.12))
      this.velocities[2 * i] += (dx / d) * push
      this.velocities[2 * i + 1] += (dy / d) * push
    }
    this.energy = 1
  }

  step(dt: number): void {
    for (let k = 0; k < this.offsets.length; k++) {
      this.velocities[k] += (-STIFFNESS * this.offsets[k] - DAMPING * this.velocities[k]) * dt
      this.offsets[k] += this.velocities[k] * dt
    }
    this.energy *= Math.exp(-dt / ENERGY_DECAY)
  }

  /** out = base + current offsets. */
  apply(base: BodyVector, out: BodyVector): BodyVector {
    for (let k = 0; k < base.length; k++) out[k] = base[k] + this.offsets[k]
    return out
  }
}
