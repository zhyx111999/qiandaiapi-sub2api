import { describe, expect, it } from 'vitest'
import { lightAngle, shortestTurn } from '../consoleLight'

describe('console specular light', () => {
  it('measures the direction clockwise from up', () => {
    expect(lightAngle(500, 0, 500, 500)).toBeCloseTo(0)
    expect(lightAngle(1000, 500, 500, 500)).toBeCloseTo(90)
    expect(lightAngle(500, 1000, 500, 500)).toBeCloseTo(180)
    expect(lightAngle(0, 500, 500, 500)).toBeCloseTo(270)
    expect(lightAngle(0, 0, 500, 500)).toBeCloseTo(315) // top left, the resting light
  })

  it('turns the short way round', () => {
    expect(shortestTurn(350, 10)).toBeCloseTo(20)
    expect(shortestTurn(10, 350)).toBeCloseTo(-20)
    expect(shortestTurn(90, 270)).toBeCloseTo(180)
    expect(shortestTurn(315, 315)).toBeCloseTo(0)
  })
})
