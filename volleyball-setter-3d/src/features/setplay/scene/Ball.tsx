import { sampleSetterBall } from '../../../logic/setterMotion'
import { useSceneStore } from '../../../store/sceneStore'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Trajectory } from '../../../types'
import { ballWorld, phaseAt, playback, sampleBall } from '../animation'
import { makeBallTexture } from './textures'
import { BALL_RADIUS } from './attackerMotion'

const TRAIL_N = 24

/**
 * 排球 + 飞行动画（自转、拖尾），采样共享播放时钟。
 * 时间轴：hold(在二传手上) → flight(传球至击球点) → attack(被击飞向对方场地) → tail(落地定格)
 */
export function Ball({ traj, attack }: { traj: Trajectory | null; attack: Trajectory | null }) {
  const params = useSceneStore(s => s.params)
  const setter = useSceneStore(s => s.players.find(p => p.id === s.setterId))
  const holdBall = (t: number) => sampleSetterBall(setter?.pos ?? { x: 0.7, z: 1.6 }, params.target, params.releaseH, params.setDirection, t, playback.hold)
  const mesh = useRef<THREE.Mesh>(null)
  const trailRef = useRef<THREE.Line>(null)
  const ballTex = useMemo(() => makeBallTexture(), [])

  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3))
    return g
  }, [])
  const trailObj = useMemo(() => {
    const m = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 })
    return new THREE.Line(trailGeo, m)
  }, [trailGeo])
  const spinAxis = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const spinQ = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    const T = traj ? traj.flightT : 1
    const AT = attack ? attack.flightT : 0.5
    const m = mesh.current
    const trail = trailRef.current
    if (!m || !trail) return
    const ph = phaseAt(T, AT, playback.t)

    if (!traj) {
      m.position.set(0, 2.2, 4.5)
      ballWorld.set(0, 2.2, 4.5)
      trail.visible = false
      return
    }

    const active = (ph.kind === 'attack' || ph.kind === 'tail') && attack ? attack : traj
    const p = sampleBall(traj, attack, playback.t, holdBall)
    m.position.set(p.x, p.y, p.z)
    ballWorld.copy(m.position)

    // 自转：绕水平面内垂直于飞行方向的轴
    const span = Math.max(1e-6, active.span)
    const ux = (active.end.x - active.start.x) / span
    const uz = (active.end.z - active.start.z) / span
    spinAxis.set(uz, 0, -ux).normalize()
    const travelled = ph.kind === 'hold' ? 0 : Math.hypot(p.x - active.start.x, p.z - active.start.z)
    spinQ.setFromAxisAngle(spinAxis, travelled / BALL_RADIUS)
    m.quaternion.copy(spinQ)

    // 按当前时间重采样拖尾，暂停与向前/向后拖动时不残留旧路线。
    const position = trail.geometry.getAttribute('position')
    const moving = ph.kind === 'flight' || ph.kind === 'attack'
    for (let i = 0; i < TRAIL_N; i++) {
      const p = sampleBall(traj, attack, Math.max(playback.hold, playback.t - (i / (TRAIL_N - 1)) * 0.18))
      position.setXYZ(i, p.x, p.y, p.z)
    }
    position.setXYZ(0, m.position.x, m.position.y, m.position.z)
    position.needsUpdate = true
    trail.visible = moving
  }, -1)

  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 32, 24]} />
        <meshPhysicalMaterial map={ballTex} roughness={0.42} clearcoat={0.5} clearcoatRoughness={0.35} />
      </mesh>
      <primitive ref={trailRef} object={trailObj} frustumCulled={false} />
    </group>
  )
}
