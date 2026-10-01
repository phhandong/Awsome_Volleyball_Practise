import type { SetDirection, Vec2, Vec3 } from '../types'
import { blendPose, clamp, copyPose, POSES, type Pose } from '../features/setplay/scene/poses'
import { BALL_RADIUS, RIG, rotateX, rotateY } from './rig'

const smooth = (u: number) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k) }
const HAND_X = 0.12
const HAND_DROP = Math.sqrt((BALL_RADIUS + RIG.handRadius) ** 2 - HAND_X ** 2)
const RELEASE_LOCAL_Y = 1.97

export function setterYaw(pos: Vec2, target: Vec2, direction: SetDirection): number {
  return Math.atan2(target.x - pos.x, target.z - pos.z) + (direction === 'back' ? Math.PI : 0)
}
function ballLocal(t: number, direction: SetDirection, hold: number): Vec3 {
  const k = smooth((t / hold - 0.5) / 0.5)
  return { x: 0, y: 1.82 + (RELEASE_LOCAL_Y - 1.82) * k,
    z: 0.28 + ((direction === 'back' ? -0.13 : 0.16) - 0.28) * k }
}
export function setterRelease(pos: Vec2, target: Vec2, height: number, direction: SetDirection): Vec3 {
  const offset = rotateY(ballLocal(1, direction, 1), setterYaw(pos, target, direction))
  return { x: pos.x + offset.x, y: height, z: pos.z + offset.z }
}
/** 两臂反解到球面两侧；保证手、球、轨迹出手点使用同一套几何。 */
function reachBall(pose: Pose, ball: Vec3): void {
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    const p = rotateX({ x: sign * HAND_X,
      y: ball.y - HAND_DROP - RIG.hipY - RIG.torsoY, z: ball.z }, -pose.torso)
    p.x -= sign * RIG.shoulderX
    p.y -= RIG.shoulderY
    const c = clamp((p.x ** 2 + p.y ** 2 + p.z ** 2 - RIG.upperArm ** 2 - RIG.forearm ** 2)
      / (2 * RIG.upperArm * RIG.forearm), -1, 1)
    const elbow = Math.acos(c)
    const y0 = -RIG.upperArm - RIG.forearm * c
    const z0 = RIG.forearm * Math.sin(elbow)
    const sz = Math.asin(clamp(-p.x / y0, -1, 1))
    const sx = Math.atan2(z0, y0 * Math.cos(sz)) - Math.atan2(p.z, p.y)
    if (side === 'L') { pose.elbowL = elbow; pose.shoulderLX = sx; pose.shoulderLZ = sz }
    else { pose.elbowR = elbow; pose.shoulderRX = sx; pose.shoulderRZ = sz }
  }
}
export function sampleSetterPose(t: number, height: number, direction: SetDirection, out: Pose, hold = 0.6): Pose {
  const u = clamp(t / hold, 0, 1)
  const k = smooth((u - 0.5) / 0.5)
  blendPose(out, POSES.setReady, POSES.setContact, k)
  out.torso = direction === 'back' ? -0.12 * k : 0.06 * (1 - k)
  out.rootY = (height - RELEASE_LOCAL_Y) * k
  reachBall(out, ballLocal(Math.min(t, hold), direction, hold))
  if (t > hold + 0.12) {
    blendPose(out, out, POSES.idle, smooth((t - hold - 0.12) / 0.3))
    if (t >= hold + 0.42) copyPose(out, POSES.idle)
  }
  return out
}
/** 举球前半段是可见的来球，随后从双手之间连续送出。 */
export function sampleSetterBall(pos: Vec2, target: Vec2, height: number, direction: SetDirection, t: number, hold = 0.6): Vec3 {
  const ball = ballLocal(t, direction, hold)
  const k = smooth((t / hold - 0.5) / 0.5)
  ball.y += (height - RELEASE_LOCAL_Y) * k
  if (t < hold * 0.5) {
    const incoming = 1 - smooth(t / (hold * 0.5))
    ball.y += 0.7 * incoming
    ball.z += 0.35 * incoming
  }
  const world = rotateY(ball, setterYaw(pos, target, direction))
  return { x: pos.x + world.x, y: world.y, z: pos.z + world.z }
}
