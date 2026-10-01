import { describe, expect, it } from 'vitest'
import { computeAttackRoute, sampleAt, solveByApex, solveBySpeed, solveByTime } from '../logic/trajectory'
import { COURT } from '../logic/court'
import { integrateBall } from '../logic/ballPhysics'

const S: Vec3ish = { x: 0.6, y: 2.2, z: 4.5 }
const E: Vec3ish = { x: 4.6, y: 2.8, z: 4.5 }

type Vec3ish = { x: number; y: number; z: number }

describe('solveByApex', () => {
  it('对称场中采样最高点逼近弧顶，端点吻合', () => {
    const r = solveByApex(S, E, 4.0)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const t = r.traj
    expect(t.flightT).toBeGreaterThan(0)
    expect(t.apexY).toBeCloseTo(4.0, 2)
    const maxY = Math.max(...t.points.map((p) => p.y))
    // 采样离散化允许 ~1.5cm 误差
    expect(maxY).toBeCloseTo(4.0, 1)
    // 端点吻合
    expect(t.points[0].y).toBeCloseTo(S.y, 5)
    expect(t.points[t.points.length - 1].y).toBeCloseTo(E.y, 5)
  })

  it('弧顶不高于两端点时报错', () => {
    expect(solveByApex(S, E, 2.0).status).toBe('error')
    expect(solveByApex(S, E, 2.21).status).toBe('error')
  })

  it('与按时间求解在相同 T 下一致', () => {
    const a = solveByApex(S, E, 4.0)
    expect(a.status).toBe('ok')
    if (a.status !== 'ok') return
    const b = solveByTime(S, E, a.traj.flightT)
    expect(b.status).toBe('ok')
    if (b.status !== 'ok') return
    expect(b.traj.speed).toBeCloseTo(a.traj.speed, 3)
    expect(b.traj.apexY).toBeCloseTo(4.0, 2)
  })
})

describe('solveByTime', () => {
  it('为抵消阻力反解更大的初速度，积分仍准确到达目标', () => {
    const r = solveByTime(S, E, 1.0)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const t = r.traj
    expect(t.flightT).toBeCloseTo(1.0)
    expect(t.horizontalV).toBeGreaterThan(4.0)
    expect(t.verticalV0).toBeGreaterThan(0.6 + 9.81 * 0.5)
    const integrated = integrateBall(t.horizontalV, t.verticalV0, t.flightT).state
    expect(integrated.d).toBeCloseTo(4, 7)
    expect(integrated.y).toBeCloseTo(0.6, 7)
  })
})

describe('solveBySpeed', () => {
  it('存在低弧与高弧两个解', () => {
    const r = solveBySpeed(S, E, 9.0, 'low')
    const h = solveBySpeed(S, E, 9.0, 'high')
    expect(r.status).toBe('ok')
    expect(h.status).toBe('ok')
    if (r.status === 'ok' && h.status === 'ok') {
      expect(r.traj.flightT).toBeLessThan(h.traj.flightT)
      expect(r.traj.apexY).toBeLessThan(h.traj.apexY)
      expect(r.traj.speed).toBeCloseTo(9, 6)
      expect(h.traj.speed).toBeCloseTo(9, 6)
    }
  })

  it('球速不足时报错', () => {
    expect(solveBySpeed(S, E, 2.0, 'low').status).toBe('error')
  })
})

describe('过网余量', () => {
  it('跨网球在高弧下有正余量，低平球可能撞网', () => {
    const ourSide = { x: 1.0, y: 2.2, z: 4.5 }
    const oppSide = { x: -1.5, y: 2.6, z: 4.5 }
    const high = solveByApex(ourSide, oppSide, 4.5)
    expect(high.status).toBe('ok')
    if (high.status === 'ok') {
      expect(high.traj.netClearance).not.toBeNull()
      expect(high.traj.netClearance!).toBeGreaterThan(0)
    }
    const low = solveByTime(ourSide, oppSide, 0.35)
    if (low.status === 'ok') {
      // 非常平的球穿网时高度应明显低于高弧
      expect(low.traj.netClearance ?? -1).toBeLessThan((high.status === 'ok' ? high.traj.netClearance! : 99))
    }
  })
})

describe('sampleAt', () => {
  it('按真实时间采样阻力轨迹，水平速度随飞行衰减', () => {
    const r = solveByTime(S, E, 1.0)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const t = r.traj
    const p0 = sampleAt(t, 0)
    expect(p0.y).toBeCloseTo(S.y, 5)
    const pEnd = sampleAt(t, t.flightT)
    expect(pEnd.y).toBeCloseTo(E.y, 3)
    expect(pEnd.x).toBeCloseTo(E.x, 5)
    const pm = sampleAt(t, t.flightT / 2)
    const mid = integrateBall(t.horizontalV, t.verticalV0, 0.5).state
    expect(pm.y).toBeCloseTo(S.y + mid.y, 6)
    expect(pm.x).toBeCloseTo(S.x + mid.d, 6)
    expect(pm.x).toBeGreaterThan((S.x + E.x) / 2)
    expect(t.velocities.at(-1)!.x).toBeLessThan(t.velocities[0].x)
  })

  it('t 超界被钳制', () => {
    const r = solveByTime(S, E, 1.0)
    if (r.status === 'ok') {
      const p = sampleAt(r.traj, 99)
      expect(p.x).toBeCloseTo(E.x, 5)
    }
  })
})

describe('computeAttackRoute（击飞轨迹）', () => {
  it('过网且落在对方场地', () => {
    const pass = solveByApex({ x: 0.7, y: 2.2, z: 1.6 }, { x: 0.95, y: 2.85, z: 7.0 }, 3.4)
    expect(pass.status).toBe('ok')
    if (pass.status !== 'ok') return
    const r = computeAttackRoute(pass.traj)
    expect(r.traj.end.x).toBeLessThan(0)
    expect(r.traj.netClearance).not.toBeNull()
    expect(r.traj.netClearance!).toBeGreaterThanOrEqual(0.1)
    expect(r.T).toBeGreaterThan(0.2)
    expect(r.T).toBeLessThan(1.2)
  })

  it('低击球点也能保证过网', () => {
    const low = solveByApex({ x: 0.7, y: 2.2, z: 1.6 }, { x: 0.95, y: 2.55, z: 7.0 }, 3.0)
    expect(low.status).toBe('ok')
    if (low.status !== 'ok') return
    const r = computeAttackRoute(low.traj)
    expect(r.traj.netClearance ?? -1).toBeGreaterThanOrEqual(0.08)
  })

  it('后排高点击球同样有效', () => {
    const back = solveByApex({ x: 0.7, y: 2.2, z: 1.6 }, { x: 4.2, y: 3.05, z: 4.5 }, 4.3)
    expect(back.status).toBe('ok')
    if (back.status !== 'ok') return
    const r = computeAttackRoute(back.traj)
    expect(r.traj.end.x).toBeLessThan(0)
    expect(r.traj.netClearance ?? -1).toBeGreaterThanOrEqual(0.08)
  })
})

describe('court zoneOf', () => {
  it('号位与朝向约定一致（4 号位在 +z 前排）', async () => {
    const { zoneOf } = await import('../logic/court')
    expect(zoneOf(1, 8)).toBe(4)
    expect(zoneOf(1, 4.5)).toBe(3)
    expect(zoneOf(1, 1)).toBe(2)
    expect(zoneOf(5, 8)).toBe(5)
    expect(zoneOf(5, 4.5)).toBe(6)
    expect(zoneOf(5, 1)).toBe(1)
    expect(COURT.netHeight).toBeCloseTo(2.43)
  })
})
