import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { Trajectory } from '../../../types'

/** 传球/击飞弧线 + 出手点/弧顶标记 */
export function TrajectoryLine({
  traj,
  color,
  dashed = false,
  markers = true,
}: {
  traj: Trajectory | null
  color: string
  dashed?: boolean
  markers?: boolean
}) {
  const points = useMemo(() => {
    if (!traj) return null
    return traj.points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
  }, [traj])

  const apex = useMemo(() => {
    if (!traj || !markers) return null
    let best = traj.points[0]
    for (const p of traj.points) if (p.y > best.y) best = p
    return best
  }, [traj, markers])

  if (!traj || !points) return null

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={2.4}
        transparent
        opacity={0.9}
        dashed={dashed}
        dashSize={0.22}
        gapSize={0.14}
      />
      {markers && (
        <>
          {/* 出手点 */}
          <mesh position={[traj.start.x, traj.start.y, traj.start.z]}>
            <sphereGeometry args={[0.045, 14, 10]} />
            <meshBasicMaterial color="#f4f6f8" transparent opacity={0.9} />
          </mesh>
          {/* 弧顶 */}
          {apex ? (
            <mesh position={[apex.x, apex.y, apex.z]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.05, 0.09, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          ) : null}
        </>
      )}
    </group>
  )
}
