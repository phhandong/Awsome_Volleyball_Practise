import { describe, expect, it } from 'vitest'
import { BALL_PHYSICS, integrateBall, stepBall } from '../logic/ballPhysics'
import { computeAttackRoute, sampleAt, solveByApex, solveBySpeed, solveByTime } from '../logic/trajectory'
import type { Trajectory } from '../types'

describe('默认空气阻力', () => {
  it('无阻力参考积分回到解析重力轨迹', () => {
    const { state } = integrateBall(7, 6, 1.3, false, 0)
    expect(state.d).toBeCloseTo(7 * 1.3, 10)
    expect(state.y).toBeCloseTo(6 * 1.3 - 9.81 * 1.3 ** 2 / 2, 10)
    expect(state.vh).toBe(7)
    expect(state.vy).toBeCloseTo(6 - 9.81 * 1.3, 10)
  })

  it('阻力持续消耗机械能，水平速度始终正向衰减', () => {
    const flight = integrateBall(12, 8, 2, true)
    const energy = (s: typeof flight.state) => (s.vh ** 2 + s.vy ** 2) / 2 + BALL_PHYSICS.gravity * s.y
    for (let i = 1; i < flight.states.length; i++) {
      expect(energy(flight.states[i])).toBeLessThan(energy(flight.states[i - 1]))
      expect(flight.states[i].vh).toBeGreaterThan(0)
      expect(flight.states[i].vh).toBeLessThan(flight.states[i - 1].vh)
    }
    expect(flight.state.d).toBeLessThan(24)
  })

  it('10ms 积分步长与 1ms 参考积分收敛一致', () => {
    const calculated = integrateBall(25, -4, 0.8).state
    let reference = { d: 0, y: 0, vh: 25, vy: -4 }
    for (let i = 0; i < 800; i++) reference = stepBall(reference, 0.001)
    expect(calculated.d).toBeCloseTo(reference.d, 6)
    expect(calculated.y).toBeCloseTo(reference.y, 6)
    expect(calculated.vh).toBeCloseTo(reference.vh, 6)
  })
})

function assertContact(traj: Trajectory) {
  const actual = integrateBall(traj.horizontalV, traj.verticalV0, traj.flightT).state
  expect(actual.d).toBeCloseTo(traj.span, 7)
  expect(actual.y).toBeCloseTo(traj.end.y - traj.start.y, 7)
  expect(sampleAt(traj, traj.flightT)).toEqual(traj.end)
  const before = sampleAt(traj, traj.flightT - 1e-6)
  expect(Math.hypot(before.x - traj.end.x, before.y - traj.end.y, before.z - traj.end.z)).toBeLessThan(0.0001)
  const time = traj.flightT * 0.371
  const middle = integrateBall(traj.horizontalV, traj.verticalV0, time).state
  const p = sampleAt(traj, time)
  expect(Math.hypot(p.x - traj.start.x, p.z - traj.start.z)).toBeCloseTo(middle.d, 6)
  expect(p.y - traj.start.y).toBeCloseTo(middle.y, 6)
}

describe('阻力轨迹约束与同步', () => {
  const start = { x: 0.7, y: 2.2, z: 1.6 }
  const targets = [
    { x: 0.95, y: 2.62, z: 2.5 },
    { x: 1.05, y: 2.9, z: 7.5 },
    { x: 4.2, y: 3.05, z: 4.5 },
  ]
  it.each(targets)('快球、拉开球和后排球三种模式均准确触球：%j', end => {
    const apex = solveByApex(start, end, 4)
    expect(apex.status).toBe('ok')
    if (apex.status !== 'ok') return
    expect(apex.traj.apexY).toBeCloseTo(4, 6)
    const results = [apex, solveByTime(start, end, 0.9), solveBySpeed(start, end, 12, 'low'), solveBySpeed(start, end, 12, 'high')]
    for (const result of results) {
      expect(result.status).toBe('ok')
      if (result.status === 'ok') assertContact(result.traj)
    }
    const attack = computeAttackRoute(apex.traj)
    expect(attack.traj.start).toEqual(apex.traj.end)
    expect(attack.T).toBe(attack.traj.flightT)
    assertContact(attack.traj)
    expect(attack.traj.velocities.at(-1)!.x ** 2 + attack.traj.velocities.at(-1)!.z ** 2)
      .toBeLessThan(attack.traj.horizontalV ** 2)
    expect(attack.traj.netClearance).toBeGreaterThanOrEqual(0.12)
  })

  it('相同出手条件下比真空飞得更短、更低', () => {
    const air = integrateBall(8, 7, 0.8)
    const vacuum = integrateBall(8, 7, 0.8, false, 0)
    expect(air.state.d).toBeLessThan(vacuum.state.d)
    expect(air.apex).toBeLessThan(vacuum.apex)
  })

  it.each([-4, 4])('从网面向任一侧飞行，网面高度取真实出手点：x=%s', x => {
    const result = solveByTime({ x: 0, y: 2.6, z: 4.5 }, { x, y: 0, z: 4.5 }, 0.8)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.traj.netClearance).toBeCloseTo(2.6 - 2.43, 8)
  })

  it('拒绝无效数值或超出求解范围的时间，不生成 NaN 轨迹', () => {
    const end = targets[1]
    for (const time of [NaN, Infinity, -1, 0, 9]) expect(solveByTime(start, end, time).status).toBe('error')
    expect(solveByApex(start, end, NaN).status).toBe('error')
    expect(solveBySpeed(start, end, Infinity, 'low').status).toBe('error')
    expect(solveByTime(start, { ...end, x: 1e300 }, 1).status).toBe('error')
  })
})
