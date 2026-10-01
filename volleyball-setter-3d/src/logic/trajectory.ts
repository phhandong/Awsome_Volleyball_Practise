import type { SolveResult, Trajectory, Vec3 } from '../types'
import { COURT } from './court'

const G = 9.81
const SAMPLES = 48

function hypot2(dx: number, dz: number): number {
  return Math.hypot(dx, dz)
}

/** 球穿过网面（x=0）处高于网带的余量；不穿网返回 null */
function computeNetClearance(points: Vec3[]): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if ((a.x > 0 && b.x < 0) || (a.x < 0 && b.x > 0)) {
      const k = a.x / (a.x - b.x)
      const y = a.y + (b.y - a.y) * k
      return y - COURT.netHeight
    }
  }
  return null
}

function buildTrajectory(
  start: Vec3,
  end: Vec3,
  horizontalV: number,
  verticalV0: number,
  flightT: number,
): Trajectory {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const span = hypot2(dx, dz)
  const ux = span > 1e-6 ? dx / span : -1
  const uz = span > 1e-6 ? dz / span : 0

  const points: Vec3[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (flightT * i) / SAMPLES
    points.push({
      x: start.x + ux * horizontalV * t,
      y: start.y + verticalV0 * t - 0.5 * G * t * t,
      z: start.z + uz * horizontalV * t,
    })
  }

  const speed = Math.hypot(horizontalV, verticalV0)
  const elevDeg = (Math.atan2(verticalV0, horizontalV) * 180) / Math.PI
  // 0° = 正朝网（-x 方向）
  const dirDeg = (Math.acos(Math.max(-1, Math.min(1, -ux))) * 180) / Math.PI
  const apexY = start.y + (verticalV0 > 0 ? (verticalV0 * verticalV0) / (2 * G) : 0)

  return {
    start,
    end,
    points,
    flightT,
    speed,
    horizontalV,
    verticalV0,
    elevDeg,
    dirDeg,
    apexY,
    span,
    netClearance: computeNetClearance(points),
  }
}

/** 按弧顶绝对高度求解（闭式解）。要求 apexH 高于出手点与击球点。 */
export function solveByApex(start: Vec3, end: Vec3, apexH: number): SolveResult {
  const span = hypot2(end.x - start.x, end.z - start.z)
  if (span < 0.05) return { status: 'error', message: '目标点与出手点距离过近' }
  const P0 = apexH - start.y
  const P1 = apexH - end.y
  if (P0 <= 0.02 || P1 <= 0.02) return { status: 'error', message: '弧顶高度必须同时高于出手点和击球点' }

  // 铅垂面内 y(d) = H - a(d-dp)²：由两端点条件解出顶点水平位置 dp
  const dp = (span * Math.sqrt(P0)) / (Math.sqrt(P0) + Math.sqrt(P1))
  const a = P0 / (dp * dp)
  // 抛物线在重力下的时间标定：a = g/(2·vh²)
  const horizontalV = Math.sqrt(G / (2 * a))
  const verticalV0 = 2 * a * dp * horizontalV
  const flightT = span / horizontalV
  return { status: 'ok', traj: buildTrajectory(start, end, horizontalV, verticalV0, flightT) }
}

/** 按飞行时间求解（唯一解） */
export function solveByTime(start: Vec3, end: Vec3, flightT: number): SolveResult {
  const span = hypot2(end.x - start.x, end.z - start.z)
  if (span < 0.05) return { status: 'error', message: '目标点与出手点距离过近' }
  if (flightT <= 0.05) return { status: 'error', message: '飞行时间过短' }
  const dy = end.y - start.y
  const verticalV0 = dy / flightT + 0.5 * G * flightT
  const horizontalV = span / flightT
  return { status: 'ok', traj: buildTrajectory(start, end, horizontalV, verticalV0, flightT) }
}

/**
 * 按出手初速度求解目标点的仰角：f(T) = (D/T)² + (dy/T + gT/2)² = v0²
 * f(T) 两端发散、有唯一极小值，因此至多两个根：小 T 为低弧，大 T 为高弧。
 */
export function solveBySpeed(start: Vec3, end: Vec3, speed: number, arc: 'low' | 'high'): SolveResult {
  const span = hypot2(end.x - start.x, end.z - start.z)
  if (span < 0.05) return { status: 'error', message: '目标点与出手点距离过近' }
  if (speed <= 0.5) return { status: 'error', message: '球速过小' }
  const dy = end.y - start.y
  const f = (T: number): number => (span / T) ** 2 + (dy / T + 0.5 * G * T) ** 2 - speed * speed

  const tMin = (span / speed) * 1.0001
  const tMax = 8
  const STEPS = 600
  let prevT = tMin
  let prevF = f(prevT)
  const roots: number[] = []
  for (let i = 1; i <= STEPS && roots.length < 2; i++) {
    const t = tMin + ((tMax - tMin) * i) / STEPS
    const curF = f(t)
    const crossing = (prevF > 0 && curF <= 0) || (prevF <= 0 && curF > 0)
    if (crossing) {
      // 二分求根（兼容上升沿与下降沿）
      let lo = prevT
      let hi = t
      const signLo = Math.sign(f(lo))
      for (let k = 0; k < 48; k++) {
        const mid = (lo + hi) / 2
        if (Math.sign(f(mid)) === signLo) lo = mid
        else hi = mid
      }
      roots.push((lo + hi) / 2)
    }
    prevT = t
    prevF = curF
  }
  if (roots.length === 0) {
    return { status: 'error', message: '该球速无法到达目标点，请提高球速或移动目标' }
  }
  const T = arc === 'low' ? roots[0] : roots[roots.length - 1]
  const horizontalV = span / T
  const verticalV0 = dy / T + 0.5 * G * T
  return { status: 'ok', traj: buildTrajectory(start, end, horizontalV, verticalV0, T) }
}

/** 取轨迹上 t 时刻的球位置（秒） */
export function sampleAt(traj: Trajectory, t: number): Vec3 {
  const T = Math.max(1e-6, traj.flightT)
  const u = Math.max(0, Math.min(1, t / T))
  const dx = traj.end.x - traj.start.x
  const dz = traj.end.z - traj.start.z
  return {
    x: traj.start.x + dx * u,
    y: traj.start.y + traj.verticalV0 * (T * u) - 0.5 * G * (T * u) ** 2,
    z: traj.start.z + dz * u,
  }
}

export interface AttackRoute {
  traj: Trajectory
  /** 击球飞行时间 */
  T: number
}

/**
 * 由传球终点（击球点）生成攻手击飞轨迹：斜线扣向对方场地，
 * 自动从快到慢挑选第一个能过网（余量 ≥0.12m）的球速；都不行时退化为高弧吊球。
 */
export function computeAttackRoute(pass: Trajectory): AttackRoute {
  const start = pass.end
  const land = {
    x: -4.3,
    y: 0,
    z: Math.max(0.4, Math.min(8.6, pass.end.z - 0.7)),
  }
  const D = Math.hypot(land.x - start.x, land.z - start.z)
  const tStart = 0.35 + D * 0.025
  for (let i = 0; i <= 15; i++) {
    const T = tStart + i * 0.05
    const r = solveByTime(start, land, T)
    if (r.status !== 'ok') continue
    const c = r.traj.netClearance
    if (c === null || c >= 0.12) return { traj: r.traj, T }
  }
  // 兜底：高弧吊球保证过网
  const apex = Math.max(2.95, start.y + 0.35)
  const r = solveByApex(start, land, apex)
  if (r.status === 'ok') return { traj: r.traj, T: r.traj.flightT }
  const last = solveByTime(start, land, 1.0)
  if (last.status === 'ok') return { traj: last.traj, T: 1.0 }
  return { traj: pass, T: 0.5 }
}
