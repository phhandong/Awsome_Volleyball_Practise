import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Trajectory, Vec2 } from '../../types'
import { advancePlayback, resetPlayback } from './animation'
import { useSceneStore } from '../../store/sceneStore'

/** 在球与人物采样前推进唯一时钟。改变路线或站位后从准备动作重新排练。 */
export function PlaybackClock({ traj, attackT, attackerPos }: {
  traj: Trajectory | null; attackT: number; attackerPos: Vec2 | undefined
}) {
  const steps = useSceneStore(s => s.params.approachSteps)
  const zone = useSceneStore(s => s.players.find(p => p.id === s.attackerId)?.rotationZone)
  useEffect(() => { resetPlayback() }, [traj, attackerPos, steps, zone])
  useFrame((_, dt) => { advancePlayback(dt, traj?.flightT ?? 1, attackT) }, -2)
  return null
}
