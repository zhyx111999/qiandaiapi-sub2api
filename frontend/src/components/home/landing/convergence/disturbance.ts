/**
 * Interactive displacement of the strands: the pointer combs nearby strands
 * aside, and a click plucks them like strings (a damped wobble that spreads
 * from the click point and dies out in about two seconds).
 */

const COMB_RADIUS = 110
const COMB_STRENGTH = 26
const PRESENCE_RATE = 5 // 1/s, how fast the comb fades in and out

const PLUCK_STRENGTH = 22
const PLUCK_DECAY = 0.65 // s
const PLUCK_FREQUENCY = 9 // rad/s
const PLUCK_REACH_X = 220
const PLUCK_REACH_Y = 140
const PLUCK_LIFETIME = 3 // s
/** px over which the push turns from "up" to "down"; keeps strands crossing the pointer height smooth. */
const SPLIT_SOFTNESS = 18

interface Pluck {
  x: number
  y: number
  age: number
}

export class StrandDisturbance {
  private pointerX = 0
  private pointerY = 0
  private pointerInside = false
  private presence = 0
  private plucks: Pluck[] = []

  setPointer(x: number, y: number): void {
    this.pointerX = x
    this.pointerY = y
    this.pointerInside = true
  }

  leave(): void {
    this.pointerInside = false
  }

  pluck(x: number, y: number): void {
    this.plucks.push({ x, y, age: 0 })
  }

  step(dt: number): void {
    const target = this.pointerInside ? 1 : 0
    this.presence += (target - this.presence) * (1 - Math.exp(-dt * PRESENCE_RATE))
    for (const pluck of this.plucks) pluck.age += dt
    this.plucks = this.plucks.filter((pluck) => pluck.age < PLUCK_LIFETIME)
  }

  /** Vertical displacement for a strand point whose undisturbed position is (x, y). */
  offset(x: number, y: number): number {
    let dy = 0

    if (this.presence > 0.001) {
      const dx = x - this.pointerX
      const dyp = y - this.pointerY
      const falloff = Math.exp(-(dx * dx + dyp * dyp) / (COMB_RADIUS * COMB_RADIUS))
      dy += Math.tanh(dyp / SPLIT_SOFTNESS) * COMB_STRENGTH * this.presence * falloff
    }

    for (const { x: px, y: py, age } of this.plucks) {
      const envelope = Math.exp(-age / PLUCK_DECAY) * Math.sin(age * PLUCK_FREQUENCY)
      const gx = (x - px) / PLUCK_REACH_X
      const gy = (y - py) / PLUCK_REACH_Y
      dy += Math.tanh((y - py) / SPLIT_SOFTNESS) * PLUCK_STRENGTH * envelope * Math.exp(-gx * gx - gy * gy)
    }

    return dy
  }
}
