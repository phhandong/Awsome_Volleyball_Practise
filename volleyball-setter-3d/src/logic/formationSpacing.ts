import type { PlayerState, RouteParams, Vec2 } from '../types'
import { planAttacker } from './approach'
import { setterRelease } from './setterMotion'
import { solveByApex, solveBySpeed, solveByTime } from './trajectory'
import { attackSpace, distanceToSegment, motionEnd, NET_BODY_MARGIN } from './motionSpace'
import { isBackRow } from './court'
export { distanceToSegment } from './motionSpace'

/** 人物中心到助跑/落地路线的排练间距，包含摆臂空间。 */
export const APPROACH_CLEARANCE = 0.9

function currentPlan(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams) {
  const setter = players.find(p => p.id === setterId)
  const attacker = players.find(p => p.id === attackerId)
  if (!setter || !attacker || setterId === attackerId) return null
  const start = setterRelease(setter.pos, params.target, params.releaseH, params.setDirection)
  const end = { ...params.target, y: params.contactH }
  const solution = params.mode === 'apex' ? solveByApex(start, end, params.apexH)
    : params.mode === 'time' ? solveByTime(start, end, params.flightT)
    : solveBySpeed(start, end, params.speed, params.arc)
  if (solution.status !== 'ok') return null
  const plan = planAttacker(attacker.pos, params.target, params.contactH, solution.traj.flightT, params.approachSteps, attacker.rotationZone)
  return { plan, setter, attacker, flightT: solution.traj.flightT }
}

export function approachLane(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams) {
  const current = currentPlan(players, setterId, attackerId, params)
  return current ? { start: current.plan.stand, end: motionEnd(current.plan) } : null
}

/** 围绕击球身体位置寻找相近助跑方向，不移动二传或击球目标，不在空中转弯。 */
function avoidSetterAndNet(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams): PlayerState[] {
  const current = currentPlan(players, setterId, attackerId, params)
  if (!current) return players
  const { plan, setter, attacker, flightT } = current
  const original = attackSpace(plan, setter.pos)
  if (!original.setterConflict && !original.netConflict) return players
  const dx = plan.stand.x - plan.contactRoot.x
  const dz = plan.stand.z - plan.contactRoot.z
  const angle = Math.atan2(dz, dx)
  const radius = Math.max(0.8, Math.hypot(dx, dz))
  let nearest: Vec2 | null = null
  let bestDistance = Infinity
  for (const scale of [1, 0.85, 1.15]) {
    for (let degrees = 0; degrees <= 180; degrees += 10) {
      for (const sign of [1, -1]) {
        const a = angle + sign * degrees * Math.PI / 180
        const pos = { x: plan.contactRoot.x + radius * scale * Math.cos(a), z: plan.contactRoot.z + radius * scale * Math.sin(a) }
        const distance = Math.hypot(pos.x - attacker.pos.x, pos.z - attacker.pos.z)
        if (distance >= bestDistance || pos.x < NET_BODY_MARGIN || pos.x > 8.65 || pos.z < 0.35 || pos.z > 8.65) continue
        const candidate = planAttacker(pos, params.target, params.contactH, flightT, params.approachSteps, attacker.rotationZone)
        const space = attackSpace(candidate, setter.pos)
        if (space.setterConflict || space.netConflict || candidate.timingDelta < Math.min(0, plan.timingDelta) - 0.005) continue
        // 原来能合法起跳的后排路线不能因避让而踩线；已有踩线风险也不能进一步恶化。
        if (isBackRow(attacker.rotationZone) && candidate.takeoffFootX < Math.min(3.001, plan.takeoffFootX) - 1e-6) continue
        bestDistance = distance
        nearest = pos
      }
    }
  }
  return nearest ? players.map(p => p.id === attackerId ? { ...p, pos: nearest } : p) : players
}

/** 先调整攻手的助跑方向避开二传与球网，再让辅助队员就近避让，保持击球目标和轮转身份。 */
export function clearApproachLane(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams): PlayerState[] {
  players = avoidSetterAndNet(players, setterId, attackerId, params)
  const lane = approachLane(players, setterId, attackerId, params)
  if (!lane) return players
  const supports = players.filter(p => p.id !== setterId && p.id !== attackerId)
  const blocked = supports.filter(p => distanceToSegment(p.pos, lane.start, lane.end) < APPROACH_CLEARANCE)
  if (!blocked.length) return players
  const occupied = players.filter(p => !blocked.includes(p)).map(p => p.pos)
  const moves = new Map<string, Vec2>()
  for (const player of blocked) {
    let nearest: Vec2 | null = null
    let nearestDistance = Infinity
    // 9m 半场内的候选网格，选择离原站位最近且不挡路、不挤占队友的位置。
    for (let x = 0.35; x <= 8.65; x += 0.25) {
      for (let z = 0.35; z <= 8.65; z += 0.25) {
        const pos = { x, z }
        const distance = Math.hypot(x - player.pos.x, z - player.pos.z)
        if (distance >= nearestDistance || distanceToSegment(pos, lane.start, lane.end) < APPROACH_CLEARANCE
          || occupied.some(p => Math.hypot(p.x - x, p.z - z) < APPROACH_CLEARANCE)) continue
        nearest = pos
        nearestDistance = distance
      }
    }
    if (nearest) { moves.set(player.id, nearest); occupied.push(nearest) }
  }
  return moves.size ? players.map(p => moves.has(p.id) ? { ...p, pos: moves.get(p.id)! } : p) : players
}
