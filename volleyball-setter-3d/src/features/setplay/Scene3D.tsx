import { useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, SoftShadows } from '@react-three/drei'
import { useSceneStore } from '../../store/sceneStore'
import { useAttackRoute, useQuality, useSolution } from './useSolution'
import { Court } from './scene/Court'
import { Net } from './scene/Net'
import { Players } from './scene/Characters'
import { Ball } from './scene/Ball'
import { TrajectoryLine } from './scene/TrajectoryLine'
import { TargetHandle } from './scene/TargetHandle'
import { QualityOverlays } from './scene/QualityOverlays'
import { CameraRig } from './scene/CameraRig'
import { makeBackdropTexture } from './scene/textures'
import { PlaybackClock } from './PlaybackClock'

function SceneContents() {
  const solution = useSolution()
  const { attack, attackT } = useAttackRoute(solution)
  const report = useQuality()
  const quality = useSceneStore((s) => s.quality)
  const params = useSceneStore((s) => s.params)
  const attackerPos = useSceneStore((s) => s.players.find((p) => p.id === s.attackerId)?.pos)
  const backdrop = useMemo(() => makeBackdropTexture(), [])
  const traj = solution.status === 'ok' ? solution.traj : null

  return (
    <>
      <PlaybackClock traj={traj} attackT={attackT} attackerPos={attackerPos} />
      {quality === 'high' && <SoftShadows size={26} samples={12} focus={0.6} />}
      <fog attach="fog" args={['#0d1526', 32, 90]} />
      <primitive object={backdrop} attach="background" />

      {/* 布光：主光（投影）+ 冷色补光 + 暖色顶光 */}
      <hemisphereLight args={['#b9cdf2', '#141a28', 0.55]} />
      <directionalLight
        position={[11, 15, 7]}
        intensity={2.1}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-13, 9, -8]} intensity={0.55} color="#8fb4ff" />
      <pointLight position={[0, 6, 4.5]} intensity={12} distance={20} decay={2} color="#ffd9a0" />

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color="#ffffff" />
        <Lightformer intensity={0.8} position={[8, 4, 8]} rotation-y={-Math.PI / 4} scale={[6, 4, 1]} color="#ffe9c9" />
        <Lightformer intensity={0.5} position={[-8, 4, -6]} rotation-y={Math.PI / 4} scale={[6, 4, 1]} color="#a9c4ff" />
      </Environment>

      <Court />
      <Net />
      <Players flightT={traj ? traj.flightT : 1} attackT={attackT} target={params.target} contactH={params.contactH} />
      <Ball traj={traj} attack={attack} />
      <TrajectoryLine traj={traj} color="#ffc83d" />
      {attack && <TrajectoryLine traj={attack} color="#ff6b5e" dashed markers={false} />}
      <TargetHandle target={params.target} contactH={params.contactH} level={report?.level} />
      {report && traj && attack && attackerPos && (
        <QualityOverlays report={report} pass={traj} attack={attack} attackerPos={attackerPos} target={params.target} />
      )}
      <CameraRig />
    </>
  )
}

export function Scene3D() {
  const quality = useSceneStore((s) => s.quality)
  return (
    <Canvas
      shadows
      dpr={quality === 'high' ? [1, 2] : [0.7, 1]}
      camera={{ fov: 50, position: [13.5, 8.5, 12.5], near: 0.1, far: 200 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
      }}
    >
      <SceneContents />
    </Canvas>
  )
}
