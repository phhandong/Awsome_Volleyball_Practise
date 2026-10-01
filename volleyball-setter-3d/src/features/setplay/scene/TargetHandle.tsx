import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Vec2 } from '../../../types'
import type { QualityLevel } from '../../../logic/quality'
import { useSceneStore } from '../../../store/sceneStore'
import { useUiStore } from '../../../store/uiStore'
import { beginAxisDrag, beginGroundDrag, clampToCourt } from './dragManager'

const LEVEL_COLOR: Record<QualityLevel, string> = {
  ok: '#ffc83d',
  warn: '#ff9d3d',
  bad: '#ff7a6e',
}

/** 传球目标点：地面光环（可拖拽）+ 立杆 + 击球点（可竖直拖拽调高度）；颜色随质量等级警示 */
export function TargetHandle({
  target,
  contactH,
  level,
}: {
  target: Vec2
  contactH: number
  level?: QualityLevel
}) {
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const setTarget = useSceneStore((s) => s.setTarget)
  const setParams = useSceneStore((s) => s.setParams)
  const setDragging = useUiStore((s) => s.setDragging)

  const ringColor = level ? LEVEL_COLOR[level] : '#ffc83d'
  const pulseSpeed = level === 'bad' ? 9 : 4

  useFrame((state) => {
    if (ringMat.current) {
      ringMat.current.opacity = 0.55 + Math.sin(state.clock.elapsedTime * pulseSpeed) * 0.25
    }
  })

  const onDragStart = (e: { button: number; stopPropagation: () => void }): void => {
    if (e.button !== 0 || useUiStore.getState().cameraMode === 'pov') return
    e.stopPropagation()
    setDragging(true)
    beginGroundDrag(
      camera,
      gl.domElement,
      (p) => {
        setTarget(clampToCourt(p.x, p.z, 0.25))
      },
      () => setDragging(false),
    )
  }

  // 拖拽击球点小球：仅改变高度
  const onHeightDrag = (e: { button: number; stopPropagation: () => void }): void => {
    if (e.button !== 0 || useUiStore.getState().cameraMode === 'pov') return
    e.stopPropagation()
    setDragging(true)
    const origin = new THREE.Vector3(target.x, contactH, target.z)
    beginAxisDrag(
      camera,
      gl.domElement,
      origin,
      (p) => {
        setParams({ contactH: Math.max(2.0, Math.min(3.4, p.y)) })
      },
      () => setDragging(false),
    )
  }

  return (
    <group position={[target.x, 0, target.z]}>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.014, 0]}
        onPointerDown={(e) => onDragStart(e)}
      >
        <ringGeometry args={[0.17, 0.26, 40]} />
        <meshBasicMaterial ref={ringMat} color={ringColor} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* 立杆（可拖拽水平位置） */}
      <mesh position={[0, contactH / 2, 0]} onPointerDown={(e) => onDragStart(e)}>
        <cylinderGeometry args={[0.008, 0.008, contactH, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {/* 击球点小球（竖直拖拽调高度） */}
      <mesh position={[0, contactH, 0]} onPointerDown={(e) => onHeightDrag(e)}>
        <sphereGeometry args={[0.08, 18, 14]} />
        <meshStandardMaterial
          color={ringColor}
          emissive={ringColor}
          emissiveIntensity={0.55}
          roughness={0.35}
        />
      </mesh>
    </group>
  )
}
