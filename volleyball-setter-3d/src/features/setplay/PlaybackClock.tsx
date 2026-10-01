import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Trajectory, Vec2 } from '../../types'
import { advancePlayback, resetPlayback } from './animation'

/** 在球与人物采样前推进唯一时钟。改变路线或站位后从准备动作重新排练。 */
export function PlaybackClock({ traj, attackT, attackerPos }: {
  traj: Trajectory | null; attackT: number; attackerPos: Vec2 | undefined
}) {
  useEffect(() => { resetPlayback() }, [traj, attackerPos])
  useFrame((_, dt) => { advancePlayback(dt, traj?.flightT ?? 1, attackT) }, -2)
  return null
}
