import type { AttackerPlan } from './approach'
import type { Vec2 } from '../types'

/** 排练通道的保守包络，覆盖身体、摆臂及制动空间，不是裁判触网判罚。 */
export const SETTER_CLEARANCE = 0.9
export const NET_BODY_MARGIN = 0.3

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq)) : 0
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)
}

export function motionEnd(plan: AttackerPlan): Vec2 {
  return { x: plan.landingRoot.x + plan.airVelocity.x * plan.brakeT / 2,
    z: plan.landingRoot.z + plan.airVelocity.z * plan.brakeT / 2 }
}

export function attackSpace(plan: AttackerPlan, setter: Vec2) {
  const end = motionEnd(plan)
  const segments = [
    { a: plan.stand, b: plan.takeoffRoot, phase: '助跑' },
    { a: plan.takeoffRoot, b: plan.landingRoot, phase: '起跳至落地' },
    { a: plan.landingRoot, b: end, phase: '落地制动' },
  ]
  let setterDistance = Infinity
  let setterPhase = ''
  for (const segment of segments) {
    const d = distanceToSegment(setter, segment.a, segment.b)
    if (d < setterDistance) { setterDistance = d; setterPhase = segment.phase }
  }
  const netDistance = Math.min(plan.stand.x, plan.takeoffRoot.x, plan.landingRoot.x, end.x)
  return { setterDistance, setterPhase, netDistance,
    setterConflict: setterDistance < SETTER_CLEARANCE - 1e-6,
    netConflict: netDistance < NET_BODY_MARGIN - 1e-6 }
}
