import { useMemo } from 'react'
import * as THREE from 'three'
import { makeAntennaTexture, makeNetTexture } from './textures'

/** 球网：网柱、网面（程序化网孔）、上下白带、侧带、红白标志杆 */
export function Net() {
  const netTex = useMemo(() => {
    const t = makeNetTexture().clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(40, 4)
    return t
  }, [])
  const antennaTex = useMemo(() => makeAntennaTexture(), [])

  return (
    <group>
      {/* 网柱 */}
      {[-0.4, 9.4].map((z) => (
        <mesh key={z} castShadow position={[0, 1.32, z]}>
          <cylinderGeometry args={[0.05, 0.06, 2.64, 16]} />
          <meshStandardMaterial color="#39435a" roughness={0.35} metalness={0.75} />
        </mesh>
      ))}

      {/* 网面 1.43m–2.43m（绕 Y 转 90°：网面沿 z 向展开于 x=0 平面） */}
      <mesh position={[0, 1.93, 4.5]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[9.9, 1.0]} />
        <meshStandardMaterial
          map={netTex}
          transparent
          alphaTest={0.05}
          side={2}
          roughness={0.8}
          color="#dfe6f2"
        />
      </mesh>

      {/* 上白带 / 下沿带 */}
      <mesh castShadow position={[0, 2.465, 4.5]}>
        <boxGeometry args={[0.035, 0.07, 9.9]} />
        <meshStandardMaterial color="#f6f8fb" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.455, 4.5]}>
        <boxGeometry args={[0.03, 0.05, 9.9]} />
        <meshStandardMaterial color="#dfe4ec" roughness={0.6} />
      </mesh>

      {/* 侧带 */}
      {[0.06, 8.94].map((z) => (
        <mesh key={`s${z}`} position={[0, 1.93, z]}>
          <boxGeometry args={[0.02, 1.0, 0.09]} />
          <meshStandardMaterial color="#f6f8fb" roughness={0.5} />
        </mesh>
      ))}

      {/* 标志杆（1.43m–3.23m，红白条纹） */}
      {[0.06, 8.94].map((z) => (
        <mesh key={`a${z}`} castShadow position={[0, 2.33, z]}>
          <cylinderGeometry args={[0.012, 0.012, 1.8, 10]} />
          <meshStandardMaterial map={antennaTex} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}
