/**
 * Fixed-capacity particle pool in orbit-plane coordinates (struct of arrays,
 * ring allocation: the oldest particle is recycled when the pool is full).
 * Particles live in the plane's frame, so they spin together with the system.
 */
export interface ParticleSeed {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  size: number
  tone: number
}

const DRAG = 0.55

export class ParticlePool {
  readonly capacity: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  readonly life: Float32Array
  readonly maxLife: Float32Array
  readonly size: Float32Array
  readonly tone: Uint8Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly vz: Float32Array
  private cursor = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.x = new Float32Array(capacity)
    this.y = new Float32Array(capacity)
    this.z = new Float32Array(capacity)
    this.vx = new Float32Array(capacity)
    this.vy = new Float32Array(capacity)
    this.vz = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.size = new Float32Array(capacity)
    this.tone = new Uint8Array(capacity)
  }

  spawn(p: ParticleSeed): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.capacity
    this.x[i] = p.x
    this.y[i] = p.y
    this.z[i] = p.z
    this.vx[i] = p.vx
    this.vy[i] = p.vy
    this.vz[i] = p.vz
    this.life[i] = p.life
    this.maxLife[i] = p.life
    this.size[i] = p.size
    this.tone[i] = p.tone
  }

  update(dt: number): void {
    const drag = Math.exp(-DRAG * dt)
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      this.z[i] += this.vz[i] * dt
      this.vx[i] *= drag
      this.vy[i] *= drag
      this.vz[i] *= drag
    }
  }

  /** Remaining life in [0, 1]; 0 means dead. */
  fade(i: number): number {
    return this.life[i] > 0 ? this.life[i] / this.maxLife[i] : 0
  }
}
