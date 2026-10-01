import type { Vec3 } from '../types'
import type { Pose } from '../features/setplay/scene/poses'

export const RIG = { hipY: 0.94, torsoY: 0.08, shoulderX: 0.185, shoulderY: 0.42,
  upperArm: 0.28, forearm: 0.235, handRadius: 0.05,
  headY: 0.645, eyeY: 0.002, eyeZ: 0.098 } as const
export const BALL_RADIUS = 0.105

export function rotateX(p: Vec3, a: number): Vec3 {
  return { x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) }
}
export function rotateY(p: Vec3, a: number): Vec3 {
  return { x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) }
}
/** 与渲染的 Euler XYZ 及关节层级一致。 */
export function handLocal(pose: Pose, side: 'L' | 'R'): Vec3 {
  const elbow = side === 'L' ? pose.elbowL : pose.elbowR
  const sx = side === 'L' ? pose.shoulderLX : pose.shoulderRX
  const sz = side === 'L' ? pose.shoulderLZ : pose.shoulderRZ
  const fore = rotateX({ x: 0, y: -RIG.forearm, z: 0 }, -elbow)
  const y = fore.y - RIG.upperArm
  const arm = rotateX({ x: -y * Math.sin(sz), y: y * Math.cos(sz), z: fore.z }, -sx)
  const torso = rotateX({ x: arm.x + (side === 'L' ? 1 : -1) * RIG.shoulderX,
    y: arm.y + RIG.shoulderY, z: arm.z }, pose.torso)
  return { x: torso.x, y: torso.y + RIG.hipY + RIG.torsoY + pose.rootY, z: torso.z }
}
