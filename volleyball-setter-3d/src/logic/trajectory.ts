import type { SolveResult, Trajectory, Vec3 } from '../types'
import { COURT } from './court'
import { BALL_PHYSICS, hermite, integrateBall } from './ballPhysics'

const G = BALL_PHYSICS.gravity
const MAX_TIME = 8
const ERROR: SolveResult = { status: 'error', message: '这些参数无法形成有效球路，请调整时间、弧顶或球速' }
type Launch = { vh: number; vy: number; flight: ReturnType<typeof integrateBall> }
// 多个面板/场景消费者重复求同一解；仅缓存纯数值结果，限制内存占用。
const launchCache = new Map<string, Launch>()

function validPoints(start: Vec3, end: Vec3): boolean {
  return [start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)
    && Math.hypot(end.x - start.x, end.z - start.z) >= 0.05
}

/** 固定时间反解初速度。每次积分使用与播放相同的阻力模型。 */
function launchForTime(span: number, dy: number, time: number) {
  const key = `${span},${dy},${time}`
  const cached = launchCache.get(key)
  if (cached) return cached
  let vh = span / time
  let vy = dy / time + G * time / 2
  if (!Number.isFinite(Math.hypot(vh, vy)) || Math.hypot(vh, vy) > 1000) return null
  for (let i = 0; i < 16; i++) {
    const flight = integrateBall(vh, vy, time)
    const rx = flight.state.d - span
    const ry = flight.state.y - dy
    const error = Math.hypot(rx, ry)
    if (error < 1e-8) {
      const launch = { vh, vy, flight }
      if (launchCache.size >= 512) launchCache.delete(launchCache.keys().next().value!)
      launchCache.set(key, launch)
      return launch
    }
    const epsH = Math.max(1e-5, Math.abs(vh) * 1e-5)
    const epsY = Math.max(1e-5, Math.abs(vy) * 1e-5)
    const h = integrateBall(vh + epsH, vy, time).state
    const v = integrateBall(vh, vy + epsY, time).state
    const a = (h.d - flight.state.d) / epsH
    const b = (v.d - flight.state.d) / epsY
    const c = (h.y - flight.state.y) / epsH
    const d = (v.y - flight.state.y) / epsY
    const det = a * d - b * c
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
    const deltaH = (d * rx - b * ry) / det
    const deltaY = (a * ry - c * rx) / det
    let accepted = false
    for (let scale = 1; scale >= 1 / 64; scale /= 2) {
      const nh = vh - scale * deltaH
      const ny = vy - scale * deltaY
      if (nh <= 0 || Math.hypot(nh, ny) > 1000) continue
      const next = integrateBall(nh, ny, time).state
      if (Math.hypot(next.d - span, next.y - dy) < error) {
        vh = nh
        vy = ny
        accepted = true
        break
      }
    }
    if (!accepted) return null
  }
  return null
}

/** 球穿过网面处高于网带的余量。等时密采样避免采用匀速水平插值。 */
function computeNetClearance(points: Vec3[], velocities: Vec3[], time: number): number | null {
  const dt = time / (points.length - 1)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a.x === 0) return a.y - COURT.netHeight
    if (a.x !== b.x && a.x * b.x <= 0) {
      const va = velocities[i - 1]
      const vb = velocities[i]
      let lo = 0
      let hi = 1
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2
        const x = hermite(a.x, b.x, va.x, vb.x, dt, mid)
        if ((x > 0) === (a.x > 0)) lo = mid
        else hi = mid
      }
      return hermite(a.y, b.y, va.y, vb.y, dt, (lo + hi) / 2) - COURT.netHeight
    }
  }
  return null
}

function buildTrajectory(start: Vec3, end: Vec3, vh: number, vy: number, flightT: number): Trajectory {
  const span = Math.hypot(end.x - start.x, end.z - start.z)
  const ux = (end.x - start.x) / span
  const uz = (end.z - start.z) / span
  const flight = integrateBall(vh, vy, flightT, true)
  const points = flight.states.map(s => ({ x: start.x + ux * s.d, y: start.y + s.y, z: start.z + uz * s.d }))
  // 反解已将积分端点误差收敛至 1e-8m；固定首尾仅消除浮点残差。
  points[0] = { ...start }
  points[points.length - 1] = { ...end }
  const velocities = flight.states.map(s => ({ x: ux * s.vh, y: s.vy, z: uz * s.vh }))
  return {
    start, end, points, velocities, flightT,
    speed: Math.hypot(vh, vy), horizontalV: vh, verticalV0: vy,
    elevDeg: Math.atan2(vy, vh) * 180 / Math.PI,
    dirDeg: Math.acos(Math.max(-1, Math.min(1, -ux))) * 180 / Math.PI,
    apexY: start.y + flight.apex, span,
    netClearance: computeNetClearance(points, velocities, flightT),
  }
}

export function solveByTime(start: Vec3, end: Vec3, flightT: number): SolveResult {
  if (!validPoints(start, end)) return { status: 'error', message: '目标点与出手点距离过近或坐标无效' }
  if (!Number.isFinite(flightT) || flightT <= 0.05 || flightT > MAX_TIME) return { status: 'error', message: '飞行时间需大于 0.05 秒且不超过 8 秒' }
  const launch = launchForTime(Math.hypot(end.x - start.x, end.z - start.z), end.y - start.y, flightT)
  return launch ? { status: 'ok', traj: buildTrajectory(start, end, launch.vh, launch.vy, flightT) } : ERROR
}

/** 在击球点位于下降段的分支上，反解指定弧顶。 */
export function solveByApex(start: Vec3, end: Vec3, apexH: number): SolveResult {
  if (!validPoints(start, end)) return { status: 'error', message: '目标点与出手点距离过近或坐标无效' }
  const p0 = apexH - start.y
  const p1 = apexH - end.y
  if (!Number.isFinite(apexH) || p0 <= 0.02 || p1 <= 0.02) return { status: 'error', message: '弧顶高度必须同时高于出手点和击球点' }
  const span = Math.hypot(end.x - start.x, end.z - start.z)
  const dy = end.y - start.y
  const at = (time: number) => launchForTime(span, dy, time)
  let lo = 0.051
  let hi = Math.min(MAX_TIME, Math.sqrt(2 * p0 / G) + Math.sqrt(2 * p1 / G))
  let upper = at(hi)
  while (upper && start.y + upper.flight.apex < apexH && hi < MAX_TIME) {
    hi = Math.min(MAX_TIME, hi * 1.35)
    upper = at(hi)
  }
  if (!upper || start.y + upper.flight.apex < apexH) return ERROR
  let time = hi
  for (let i = 0; i < 24; i++) {
    const launch = at(time)
    if (!launch) return ERROR
    const delta = start.y + launch.flight.apex - apexH
    if (Math.abs(delta) < 1e-7) return { status: 'ok', traj: buildTrajectory(start, end, launch.vh, launch.vy, time) }
    if (delta < 0) lo = time
    else hi = time
    const adjacent = at(time + 0.0001)
    const slope = adjacent ? (adjacent.flight.apex - launch.flight.apex) / 0.0001 : 0
    const next = time - delta / slope
    time = Number.isFinite(next) && next > lo && next < hi ? next : (lo + hi) / 2
  }
  return solveByTime(start, end, (lo + hi) / 2)
}

/** 初速度随飞行时间形成两个分支；先找最低可达球速，再分别求低/高弧。 */
export function solveBySpeed(start: Vec3, end: Vec3, speed: number, arc: 'low' | 'high'): SolveResult {
  if (!validPoints(start, end)) return { status: 'error', message: '目标点与出手点距离过近或坐标无效' }
  if (!Number.isFinite(speed) || speed <= 0.5) return { status: 'error', message: '球速过小或无效' }
  const span = Math.hypot(end.x - start.x, end.z - start.z)
  const dy = end.y - start.y
  const minT = Math.max(0.051, span / speed)
  if (minT >= MAX_TIME) return ERROR
  const required = (time: number) => {
    const launch = launchForTime(span, dy, time)
    return launch ? Math.hypot(launch.vh, launch.vy) : Infinity
  }
  let a = minT
  let b = MAX_TIME
  const ratio = (Math.sqrt(5) - 1) / 2
  let c = b - ratio * (b - a)
  let d = a + ratio * (b - a)
  let fc = required(c)
  let fd = required(d)
  for (let i = 0; i < 32; i++) {
    if (fc < fd) {
      b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = required(c)
    } else {
      a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = required(d)
    }
  }
  const bestT = (a + b) / 2
  const bestSpeed = required(bestT)
  if (bestSpeed > speed + 1e-7) return { status: 'error', message: '该球速无法到达目标点，请提高球速或移动目标' }
  if (Math.abs(bestSpeed - speed) < 1e-7) return solveByTime(start, end, bestT)
  let lo = arc === 'low' ? minT : bestT
  let hi = arc === 'low' ? bestT : MAX_TIME
  if (arc === 'low' && required(lo) < speed) return ERROR
  if (required(hi) < speed && arc === 'high') return ERROR
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2
    const delta = required(mid) - speed
    if (Math.abs(delta) < 1e-7) return solveByTime(start, end, mid)
    if ((delta > 0) === (arc === 'low')) lo = mid
    else hi = mid
  }
  return solveByTime(start, end, (lo + hi) / 2)
}

/** 等时积分点之间用位置与速度插值，播放无需每帧重新求解。 */
export function sampleAt(traj: Trajectory, t: number): Vec3 {
  if (t <= 0) return { ...traj.start }
  if (t >= traj.flightT) return { ...traj.end }
  const position = t / traj.flightT * (traj.points.length - 1)
  const i = Math.min(traj.points.length - 2, Math.floor(position))
  const u = position - i
  const dt = traj.flightT / (traj.points.length - 1)
  const a = traj.points[i]
  const b = traj.points[i + 1]
  const va = traj.velocities[i]
  const vb = traj.velocities[i + 1]
  return {
    x: hermite(a.x, b.x, va.x, vb.x, dt, u),
    y: hermite(a.y, b.y, va.y, vb.y, dt, u),
    z: hermite(a.z, b.z, va.z, vb.z, dt, u),
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
