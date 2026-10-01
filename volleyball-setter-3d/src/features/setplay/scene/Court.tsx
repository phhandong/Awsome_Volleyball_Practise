import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import { useSceneStore } from '../../../store/sceneStore'
import { COURT, zoneCenter } from '../../../logic/court'
import { makeFloorTexture, makeZoneLabelTexture } from './textures'

/** 场地：地板（可选反射）、白色标线、号位标注、看台剪影 */
export function Court() {
  const theme = useSceneStore((s) => s.theme)
  const quality = useSceneStore((s) => s.quality)
  const showZones = useSceneStore((s) => s.showZones)
  const floorTex = useMemo(() => makeFloorTexture(theme), [theme])

  return (
    <group>
      {/* 地板 26×17（含四周无障碍区 4m），中心 (0,0,4.5) */}
      <mesh receiveShadow position={[0, 0, 4.5]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[26, 17]} />
        {quality === 'high' ? (
          <MeshReflectorMaterial
            map={floorTex}
            blur={[280, 80]}
            resolution={1024}
            mixBlur={0.9}
            mixStrength={0.35}
            depthScale={0.8}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            roughness={0.85}
            metalness={0.05}
            color="#ffffff"
          />
        ) : (
          <meshStandardMaterial map={floorTex} roughness={0.9} metalness={0.02} />
        )}
      </mesh>

      {/* 标线（略微凸起保证任意角度清晰） */}
      <group position={[0, 0.006, 0]}>
        <LineBox args={[18.06, 0.012, 0.05]} position={[0, 0, 0]} />
        <LineBox args={[18.06, 0.012, 0.05]} position={[0, 0, 9]} />
        <LineBox args={[0.05, 0.012, 9]} position={[-9, 0, 4.5]} />
        <LineBox args={[0.05, 0.012, 9]} position={[9, 0, 4.5]} />
        <LineBox args={[0.05, 0.012, 9]} position={[0, 0, 4.5]} />
        {/* 三米为进攻线后缘，整条线属于前区，与起跳脚判定一致。 */}
        <LineBox args={[COURT.lineWidth, 0.012, 9]} position={[COURT.attackLine - COURT.lineWidth / 2, 0, 4.5]} />
        <LineBox args={[COURT.lineWidth, 0.012, 9]} position={[-COURT.attackLine + COURT.lineWidth / 2, 0, 4.5]} />
      </group>

      {/* 号位标注（仅我方半场） */}
      {showZones &&
        ([1, 2, 3, 4, 5, 6] as const).map((zone) => {
          const center = zoneCenter(zone)
          return (
            <group key={zone} position={[center.x, 0.011, center.z]} rotation={[0, Math.PI / 2, 0]}>
              <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1.1, 1.1]} />
                <meshBasicMaterial
                  map={makeZoneLabelTexture(String(zone))}
                  transparent
                  opacity={0.32}
                  depthWrite={false}
                />
              </mesh>
            </group>
          )
        })}

      {/* 看台剪影（受雾淡化） */}
      <StandBox position={[0, 1.6, -7.2]} args={[30, 3.2, 2.6]} />
      <StandBox position={[0, 2.6, -9.4]} args={[30, 2.2, 2.2]} />
      <StandBox position={[0, 1.6, 16.2]} args={[30, 3.2, 2.6]} />
      <StandBox position={[0, 2.6, 18.4]} args={[30, 2.2, 2.2]} />
      <StandBox position={[-15.6, 1.6, 4.5]} args={[2.6, 3.2, 24]} />
      <StandBox position={[15.6, 1.6, 4.5]} args={[2.6, 3.2, 24]} />
    </group>
  )
}

function LineBox({
  args,
  position,
}: {
  args: [number, number, number]
  position: [number, number, number]
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color="#f4f6f8"
        roughness={0.6}
        emissive="#dfe6ee"
        emissiveIntensity={0.18}
      />
    </mesh>
  )
}

function StandBox({
  position,
  args,
}: {
  position: [number, number, number]
  args: [number, number, number]
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#141d33" roughness={1} metalness={0} />
    </mesh>
  )
}
