/** A call travelling along a strand, left to right. */
export interface Pulse {
  strand: number
  x: number
  /** px/s */
  speed: number
}

/** Pulses in flight; a pulse is dropped once its tail has left the right edge. */
export class PulseTrain {
  readonly pulses: Pulse[] = []

  spawn(strand: number, x: number, speed: number): void {
    this.pulses.push({ strand, x, speed })
  }

  step(dt: number, rightEdge: number, tailLength: number): void {
    for (const pulse of this.pulses) pulse.x += pulse.speed * dt
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      if (this.pulses[i].x - tailLength > rightEdge) this.pulses.splice(i, 1)
    }
  }
}
