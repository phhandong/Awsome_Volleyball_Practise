import * as THREE from 'three'
import type { Trajectory, Vec3 } from '../../types'
import { sampleAt } from '../../logic/trajectory'

/**
 * 播放时钟（非响应式单例）：所有 3D 组件在 useFrame 中直接读写，
 * 避免每帧触发 React 渲染。UI 通过 rAF 轮询读取。
 * 一个循环：hold(二传举球) → flight(传球飞行) → attack(攻手击球后球飞向对方场地) → tail(落地定格)
 */
export const playback = {
  /** 一个完整循环内的时间（秒） */
  t: 0,
  playing: true,
  speed: 1,
  /** 出手前定格 */
  hold: 0.6,
  /** 击球后定格 */
  tail: 0.7,
}

export function cycleLength(flightT: number, attackT: number): number {
  return playback.hold + flightT + attackT + playback.tail
}

export function resetPlayback(): void {
  playback.t = 0
}

/** 保留循环跨界后的余时；所有动画消费者在此更新之后采样。 */
export function advancePlayback(dt: number, flightT: number, attackT: number): void {
  if (!playback.playing) return
  const cycle = cycleLength(flightT, attackT)
  playback.t = (playback.t + Math.max(0, dt) * playback.speed) % cycle
}

export interface Phase {
  kind: 'hold' | 'flight' | 'attack' | 'tail'
  /** 相位内归一化进度 0..1 */
  u: number
  /** 相位开始时刻（秒） */
  start: number
  /** 相位时长（秒） */
  dur: number
}

export function phaseAt(flightT: number, attackT: number, t: number): Phase {
  const h = playback.hold
  if (t < h) return { kind: 'hold', u: t / h, start: 0, dur: h }
  if (t < h + flightT) {
    const u = flightT > 1e-6 ? (t - h) / flightT : 1
    return { kind: 'flight', u, start: h, dur: flightT }
  }
  const aStart = h + flightT
  if (t < aStart + attackT) {
    const u = attackT > 1e-6 ? (t - aStart) / attackT : 1
    return { kind: 'attack', u, start: aStart, dur: attackT }
  }
  return { kind: 'tail', u: (t - aStart - attackT) / playback.tail, start: aStart + attackT, dur: playback.tail }
}

/** 球和拖尾共用的时间采样，传球终点与扣球起点在同一时刻相接。 */
export function sampleBall(traj: Trajectory, attack: Trajectory | null, t: number, holdBall?: (time: number) => Vec3): Vec3 {
  const ph = phaseAt(traj.flightT, attack?.flightT ?? 0.5, t)
  if (ph.kind === 'hold') {
    if (holdBall) return holdBall(t)
    const k = ph.u * ph.u * (3 - 2 * ph.u)
    return { ...traj.start, y: traj.start.y - Math.max(0.2, traj.start.y - 1) * (1 - k) }
  }
  if (ph.kind === 'flight') return sampleAt(traj, t - ph.start)
  if (ph.kind === 'attack' && attack) return sampleAt(attack, t - ph.start)
  return attack ? attack.end : traj.end
}

/** 球当前世界坐标（由 Ball 每帧写入，POV 相机等消费） */
export const ballWorld = new THREE.Vector3(0, 2, 0)
