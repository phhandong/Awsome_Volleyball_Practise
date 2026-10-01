import type { PlayerState, RouteParams, Vec2 } from '../types'
import { planAttacker } from './approach'
import { setterRelease } from './setterMotion'
import { solveByApex, solveBySpeed, solveByTime } from './trajectory'

/** 人物中心到助跑/落地路线的排练间距，包含摆臂空间。 */
export const APPROACH_CLEARANCE = 0.9

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq)) : 0
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)
}

export function approachLane(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams) {
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
  return { start: plan.stand, end: {
    x: plan.landingRoot.x + plan.airVelocity.x * plan.brakeT / 2,
    z: plan.landingRoot.z + plan.airVelocity.z * plan.brakeT / 2,
  } }
}

/** 套用或编辑路线时让挡路的非出手队员就近避让，不改变二传、攻手或轮转身份。 */
export function clearApproachLane(players: PlayerState[], setterId: string, attackerId: string, params: RouteParams): PlayerState[] {
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
