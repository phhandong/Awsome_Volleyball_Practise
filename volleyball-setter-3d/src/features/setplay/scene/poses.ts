/** 姿态参数：全部为关节欧拉角（弧度）与重心升降。手臂静置指向 -Y。 */

export interface Pose {
  pelvisYaw: number
  torsoYaw: number
  torsoRoll: number
  shoulderLY: number
  shoulderRY: number
  wristLX: number
  wristLY: number
  wristLZ: number
  wristRX: number
  wristRY: number
  wristRZ: number
  forearmRollL: number
  forearmRollR: number
  curlL: number
  curlR: number
  spreadL: number
  spreadR: number
  thumbL: number
  thumbR: number
  hipLY: number
  hipLZ: number
  hipRY: number
  hipRZ: number
  ankleLX: number
  ankleLY: number
  ankleLZ: number
  ankleRX: number
  ankleRY: number
  ankleRZ: number
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  shoulderLX: number
  shoulderLZ: number
  shoulderRX: number
  shoulderRZ: number
  elbowL: number
  elbowR: number
  torso: number
  rootY: number
}

export const NEUTRAL_JOINTS = {
  pelvisYaw: 0, torsoYaw: 0, torsoRoll: 0, shoulderLY: 0, shoulderRY: 0,
  wristLX: 0, wristLY: 0, wristLZ: 0, wristRX: 0, wristRY: 0, wristRZ: 0,
  forearmRollL: 0, forearmRollR: 0,
  curlL: 0.18, curlR: 0.18, spreadL: 0.14, spreadR: 0.14,
  // 拇指绕腕局部 Z 轴的张角。中性手位（掌心朝体侧）下局部 -X/+X 即世界中线方向；
  // 掌心翻转的姿势（如二传朝内托球）会反转局部 X 轴的世界朝向，需按姿势覆写。
  thumbL: -1.04, thumbR: 1.04,
  hipLY: 0, hipLZ: 0, hipRY: 0, hipRZ: 0,
  ankleLX: 0, ankleLY: 0, ankleLZ: 0, ankleRX: 0, ankleRY: 0, ankleRZ: 0,
}

export const POSES = {
  /** 自然站立微屈膝。踝背屈抵消小腿前倾使脚掌放平；rootY 与屈膝缩短的腿长匹配，鞋底恰好贴地 */
  idle: {
    ...NEUTRAL_JOINTS,
    hipL: 0.28, hipR: 0.28, kneeL: -0.55, kneeR: -0.55,
    ankleLX: -0.27, ankleRX: -0.27,
    shoulderLX: 0.12, shoulderLZ: 0.12, shoulderRX: 0.12, shoulderRZ: -0.12,
    elbowL: 0.3, elbowR: 0.3, torso: 0.14, rootY: -0.0316,
  },
  /** 垫球准备（踝背屈 0.68-1.1，rootY 匹配腿长缩短 0.1326） */
  receive: {
    ...NEUTRAL_JOINTS,
    hipL: 0.68, hipR: 0.68, kneeL: -1.1, kneeR: -1.1,
    ankleLX: -0.42, ankleRX: -0.42,
    shoulderLX: 0.55, shoulderLZ: 0.14, shoulderRX: 0.55, shoulderRZ: -0.14,
    elbowL: 0.08, elbowR: 0.08, torso: 0.36, rootY: -0.1326,
  },
  /** 二传传球准备（手上举至额前） */
  setReady: {
    ...NEUTRAL_JOINTS,
    hipL: 0.48, hipR: 0.48, kneeL: -0.92, kneeR: -0.92,
    shoulderLX: 1.15, shoulderLZ: 0.28, shoulderRX: 1.15, shoulderRZ: -0.28,
    elbowL: 1.35, elbowR: 1.35, torso: 0.2, rootY: -0.12,
  },
  /** 二传出手（双臂伸直头上） */
  setContact: {
    ...NEUTRAL_JOINTS,
    hipL: 0.12, hipR: 0.12, kneeL: -0.18, kneeR: -0.18,
    shoulderLX: 2.75, shoulderLZ: 0.2, shoulderRX: 2.75, shoulderRZ: -0.2,
    elbowL: 0.16, elbowR: 0.16, torso: -0.06, rootY: 0.03,
  },
  /** 扣球助跑 */
  spikeRun: {
    ...NEUTRAL_JOINTS,
    hipL: 0.85, hipR: -0.35, kneeL: -1.25, kneeR: -0.4,
    shoulderLX: -0.75, shoulderLZ: 0.2, shoulderRX: 0.95, shoulderRZ: -0.2,
    elbowL: 0.55, elbowR: 0.45, torso: 0.3, rootY: -0.1,
  },
  /** 扣球起跳挥臂（右臂接近竖直向上，保证手能击到球） */
  spikeJump: {
    ...NEUTRAL_JOINTS,
    hipL: 0.16, hipR: 0.16, kneeL: -0.12, kneeR: -0.12,
    shoulderLX: 1.15, shoulderLZ: 0.55, shoulderRX: 2.98, shoulderRZ: -0.12,
    elbowL: 0.9, elbowR: 0.15, torso: -0.18, rootY: 0,
  },
  /** 击球后随挥（手臂斩下、身体前压） */
  spikeFollow: {
    ...NEUTRAL_JOINTS,
    hipL: 0.25, hipR: 0.25, kneeL: -0.4, kneeR: -0.4,
    shoulderLX: 0.6, shoulderLZ: 0.3, shoulderRX: 0.5, shoulderRZ: -0.2,
    elbowL: 0.4, elbowR: 0.3, torso: 0.35, rootY: 0,
  },
  /** 拦网 */
  block: {
    ...NEUTRAL_JOINTS,
    hipL: 0.2, hipR: 0.2, kneeL: -0.35, kneeR: -0.35,
    shoulderLX: 2.85, shoulderLZ: 0.16, shoulderRX: 2.85, shoulderRZ: -0.16,
    elbowL: 0.1, elbowR: 0.1, torso: -0.02, rootY: 0,
  },
} as const

export type PoseName = keyof typeof POSES

const KEYS = Object.keys(POSES.idle) as (keyof Pose)[]

export function createScratchPose(): Pose {
  return { ...POSES.idle }
}

/** 将 b 按 k 混合入 a（写出 out，避免每帧分配） */
export function blendPose(out: Pose, a: Pose, b: Pose, k: number): Pose {
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k
  return out
}

export function copyPose(out: Pose, src: Pose): Pose {
  for (const key of KEYS) out[key] = src[key]
  return out
}

/** 平滑趋近：当前值向目标值指数衰减（帧率无关） */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
