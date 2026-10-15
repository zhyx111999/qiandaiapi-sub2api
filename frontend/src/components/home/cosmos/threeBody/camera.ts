/**
 * Perspective view onto the orbital plane. Orbit-plane points (x, y, z) are
 * spun about the plane normal, tilted away from the viewer, turned by a small
 * pointer-driven yaw, projected, then rolled on screen.
 */
export interface Projected {
  x: number
  y: number
  /** Perspective scale factor (> 1 is closer to the viewer). */
  scale: number
}

const DISTANCE = 4.2

export class OrbitCamera {
  /** Spin about the plane normal (the system's own rotation), radians. */
  spin = 0
  tilt = 1.08
  yaw = 0
  roll = -0.24
  /** Pixels per orbit unit. */
  unit = 1
  centerX = 0
  centerY = 0

  private cs = 1
  private ss = 0
  private ct = 1
  private st = 0
  private cy = 1
  private sy = 0
  private cr = 1
  private sr = 0

  /** Caches trig for the current angles; call once per frame before projecting. */
  update(): void {
    this.cs = Math.cos(this.spin)
    this.ss = Math.sin(this.spin)
    this.ct = Math.cos(this.tilt)
    this.st = Math.sin(this.tilt)
    this.cy = Math.cos(this.yaw)
    this.sy = Math.sin(this.yaw)
    this.cr = Math.cos(this.roll)
    this.sr = Math.sin(this.roll)
  }

  project(x: number, y: number, z: number, out: Projected): Projected {
    const x1 = x * this.cs - y * this.ss
    const y1 = x * this.ss + y * this.cs
    const y2 = y1 * this.ct - z * this.st
    const z2 = y1 * this.st + z * this.ct
    const x3 = x1 * this.cy + z2 * this.sy
    const z3 = -x1 * this.sy + z2 * this.cy
    const scale = DISTANCE / (DISTANCE - z3)
    const px = x3 * scale
    const py = y2 * scale
    out.x = this.centerX + (px * this.cr - py * this.sr) * this.unit
    out.y = this.centerY - (px * this.sr + py * this.cr) * this.unit
    out.scale = scale
    return out
  }

  /** Approximate inverse onto the z = 0 plane (ignores perspective and yaw); good enough for click targeting. */
  unproject(sx: number, sy: number): { x: number; y: number } {
    const px = (sx - this.centerX) / this.unit
    const py = -(sy - this.centerY) / this.unit
    const x3 = px * this.cr + py * this.sr
    const y2 = -px * this.sr + py * this.cr
    const y1 = y2 / Math.max(this.ct, 0.2)
    return { x: x3 * this.cs + y1 * this.ss, y: -x3 * this.ss + y1 * this.cs }
  }
}
