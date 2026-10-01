import * as THREE from 'three'
import { blendPose, clamp, copyPose, POSES, type Pose } from './poses'

import { ATTACK_YAW, footSequence, stepEnds, type AttackerPlan } from '../../../logic/approach'
import { handLocal } from '../../../logic/rig'
export { planAttacker, AIR_SPEED } from '../../../logic/approach'
export { RIG, BALL_RADIUS } from '../../../logic/rig'
const G = 9.81
const smooth01 = (u: number) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k) }
export function rightHandLocal(pose: Pose, out = new THREE.Vector3()): THREE.Vector3 {
  const p = handLocal(pose, 'R'); return out.set(p.x, p.y, p.z)
}

export interface AttackerFrame { x: number; z: number; yaw: number }

/** 完全由播放时间采样，暂停、拖动、变速与回放不会产生姿态追赶误差。 */
export function sampleAttacker(plan: AttackerPlan, t: number, pose: Pose, out: AttackerFrame): void {
  const runT = Math.max(1e-6, plan.takeoffT - plan.startT)
  const runU = clamp((t - plan.startT) / runT, 0, 1)
  // Hermite 位移：起动速度为 0，离地前速度恰为 airSpeed，位置和速度均连续。
  const moveK = plan.distance > 1e-6
    ? smooth01(runU) + (runU ** 3 - runU ** 2) * runT * plan.airSpeed / plan.distance
    : 0
  if (t < plan.takeoffT) {
    out.x = plan.stand.x + (plan.takeoffRoot.x - plan.stand.x) * moveK
    out.z = plan.stand.z + (plan.takeoffRoot.z - plan.stand.z) * moveK
  } else if (t <= plan.landingT) {
    const airT = t - plan.takeoffT
    out.x = plan.takeoffRoot.x + plan.airVelocity.x * airT
    out.z = plan.takeoffRoot.z + plan.airVelocity.z * airT
  } else {
    // 落地后通过地面制动，0.2s 内水平速度连续降为 0。
    const brakeT = clamp(t - plan.landingT, 0, plan.brakeT)
    const moveT = brakeT - brakeT * brakeT / (2 * plan.brakeT)
    out.x = plan.landingRoot.x + plan.airVelocity.x * moveT
    out.z = plan.landingRoot.z + plan.airVelocity.z * moveT
  }
  const turnK = smooth01((runU - 0.55) / 0.45)
  const turn = Math.atan2(Math.sin(ATTACK_YAW - plan.runYaw), Math.cos(ATTACK_YAW - plan.runYaw))
  out.yaw = plan.runYaw + turn * turnK

  if (t < plan.startT) {
    copyPose(pose, POSES.receive)
  } else if (t < plan.takeoffT) {
    blendPose(pose, POSES.receive, POSES.spikeRun, smooth01(runU / 0.2))
    const ends = stepEnds(plan.steps)
    const step = Math.max(0, ends.findIndex(end => runU <= end))
    const previous = step ? ends[step - 1] : 0
    const progress = clamp((runU - previous) / (ends[step] - previous), 0, 1)
    const swing = Math.sin(progress * Math.PI)
    const sign = footSequence(plan.steps)[step] === 'L' ? 1 : -1
    const phase = runU * plan.steps * Math.PI
    const env = smooth01(runU / 0.12) * (1 - smooth01((runU - 0.72) / 0.28))
    const s = sign * swing
    pose.hipL += (0.55 * s - pose.hipL) * env
    pose.hipR += (-0.55 * s - pose.hipR) * env
    pose.kneeL += (-0.3 - 0.62 * Math.max(0, Math.sin(phase - 1.1)) - pose.kneeL) * env
    pose.kneeR += (-0.3 - 0.62 * Math.max(0, Math.sin(phase - 1.1 + Math.PI)) - pose.kneeR) * env
    pose.shoulderLX += (0.15 - 0.5 * s - pose.shoulderLX) * env
    pose.shoulderRX += (0.15 + 0.5 * s - pose.shoulderRX) * env
    pose.rootY += 0.045 * (0.5 - 0.5 * Math.cos(2 * phase)) * env
    blendPose(pose, pose, POSES.spikeJump, smooth01((runU - 0.78) / 0.22))
  } else if (t <= plan.contactT) {
    copyPose(pose, POSES.spikeJump)
    const airT = t - plan.takeoffT
    pose.rootY = Math.max(0, G * plan.riseT * airT - 0.5 * G * airT * airT)
  } else {
    const after = t - plan.contactT
    if (after < 0.12) blendPose(pose, POSES.spikeJump, POSES.spikeFollow, smooth01(after / 0.12))
    else if (t < plan.landingT) copyPose(pose, POSES.spikeFollow)
    else if (t < plan.landingT + 0.12) blendPose(pose, POSES.spikeFollow, POSES.receive, smooth01((t - plan.landingT) / 0.12))
    else blendPose(pose, POSES.receive, POSES.idle, smooth01((t - plan.landingT - 0.12) / 0.3))
    // 腾空高度独立于随挥姿态；落地后才屈膝缓冲。
    if (t <= plan.landingT) pose.rootY = Math.max(0, plan.jumpH - 0.5 * G * after * after)
  }
}
