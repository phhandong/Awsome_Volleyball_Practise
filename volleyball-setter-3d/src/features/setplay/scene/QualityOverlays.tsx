import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import type { Trajectory, Vec2 } from '../../../types'
import type { QualityLevel, QualityReport } from '../../../logic/quality'
import { useUiStore } from '../../../store/uiStore'
import { planAttacker } from './attackerMotion'

const LEVEL_COLOR: Record<QualityLevel, string> = {
  ok: '#7ce6a5',
  warn: '#ffc83d',
  bad: '#ff7a6e',
}

function findNetCross(attack: Trajectory | null) {
  if (!attack) return null
  for (let i = 1; i < attack.points.length; i++) {
    const a = attack.points[i - 1]
    const b = attack.points[i]
    if ((a.x > 0 && b.x <= 0) || (a.x < 0 && b.x >= 0)) {
      const k = a.x / (a.x - b.x)
      return { x: 0, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
    }
  }
  return null
}

/** 质量图例文字标签（DOM chip，不响应指针） */
function Chip({
  position,
  text,
  level,
}: {
  position: [number, number, number]
  text: string
  level: QualityLevel
}) {
  const show = useUiStore((s) => s.showQuality)
  return (
    <Html position={position} center style={{ pointerEvents: 'none', display: show ? undefined : 'none' }}>
      <div className={`q-chip q-${level}`}>{text}</div>
    </Html>
  )
}

/** 传球质量 3D 浮动图例：离网距离尺、击球高度尺、弧顶标签、人球节奏标签、过网余量标签 */
export function QualityOverlays({
  report,
  pass,
  attack,
  attackerPos,
  target,
}: {
  report: QualityReport
  pass: Trajectory
  attack: Trajectory | null
  attackerPos: Vec2
  target: Vec2
}) {
  const show = useUiStore((s) => s.showQuality)
  const motion = useMemo(() => planAttacker(attackerPos, target, pass.end.y, pass.flightT),
    [attackerPos, target, pass])
  const takeoff = motion.takeoffRoot

  const apex = useMemo(() => {
    let best = pass.points[0]
    for (const p of pass.points) if (p.y > best.y) best = p
    return best
  }, [pass])

  const netCross = useMemo(() => findNetCross(attack), [attack])

  // 助跑信息：距离、按 0.75m/步折算的步数、步点位置
  const runInfo = useMemo(() => {
    const dx = takeoff.x - attackerPos.x
    const dz = takeoff.z - attackerPos.z
    const d = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.round(d / 0.75))
    const dots: { x: number; z: number }[] = []
    for (let i = 1; i < steps; i++) {
      const k = i / steps
      dots.push({ x: attackerPos.x + dx * k, z: attackerPos.z + dz * k })
    }
    return { d, steps, dots }
  }, [attackerPos, takeoff])

  const item = (key: string): QualityReport['items'][number] | undefined =>
    report.items.find((i) => i.key === key)
  const offnet = item('offnet')
  const contact = item('contact')
  const apexItem = item('apex')
  const timing = item('timing')
  const clearance = item('clearance')

  const [b0, b1] = report.offNetBand
  const tx = target.x
  const tz = target.z
  const rz = tz + 0.5
  const contactH = pass.end.y
  const reach = report.attackerReach

  return (
    <group visible={show}>
      {/* 离网理想区色带 */}
      <mesh rotation-x={-Math.PI / 2} position={[(b0 + b1) / 2, 0.008, tz]}>
        <planeGeometry args={[b1 - b0, 2.2]} />
        <meshBasicMaterial color="#7ce6a5" transparent opacity={0.1} depthWrite={false} />
      </mesh>

      {/* 离网距离尺 */}
      {offnet && (
        <group>
          <Line points={[[0, 0.02, tz], [tx, 0.02, tz]]} color={LEVEL_COLOR[offnet.level]} lineWidth={2} transparent opacity={0.9} />
          <Line points={[[0, 0.02, tz - 0.16], [0, 0.02, tz + 0.16]]} color={LEVEL_COLOR[offnet.level]} lineWidth={2} />
          <Line points={[[tx, 0.02, tz - 0.16], [tx, 0.02, tz + 0.16]]} color={LEVEL_COLOR[offnet.level]} lineWidth={2} />
          <Chip position={[tx / 2, 0.14, tz]} text={offnet.value} level={offnet.level} />
        </group>
      )}

      {/* 击球高度尺 + 网顶刻度 + 摸高环 */}
      {contact && (
        <group>
          <Line
            points={[[tx, 0, rz], [tx, Math.max(contactH, 0.01), rz]]}
            color={LEVEL_COLOR[contact.level]}
            lineWidth={2}
          />
          <Line points={[[tx - 0.09, 2.43, rz], [tx + 0.09, 2.43, rz]]} color="#8fa3c8" lineWidth={1.5} />
          <Line
            points={[[tx - 0.09, reach, rz], [tx + 0.09, reach, rz]]}
            color={LEVEL_COLOR[contact.level]}
            lineWidth={1.5}
            dashed
            dashSize={0.06}
            gapSize={0.04}
          />
          <mesh rotation-x={-Math.PI / 2} position={[tx, reach, tz]}>
            <ringGeometry args={[0.4, 0.43, 44]} />
            <meshBasicMaterial color={LEVEL_COLOR[contact.level]} transparent opacity={0.45} depthWrite={false} />
          </mesh>
          <Chip position={[tx, contactH + 0.17, rz]} text={contact.value} level={contact.level} />
          <Chip position={[tx, Math.max(reach + 0.14, contactH + 0.42), rz]} text={`摸高 ${reach.toFixed(2)}m`} level={contact.level} />
        </group>
      )}

      {/* 弧顶标签 */}
      {apexItem && (
        <Chip position={[apex.x, apex.y + 0.18, apex.z]} text={apexItem.value} level={apexItem.level} />
      )}

      {/* 人球节奏：助跑虚线 + 步点 + 攻手头顶标签 */}
      {timing && (
        <group>
          <Line
            points={[[attackerPos.x, 0.03, attackerPos.z], [takeoff.x, 0.03, takeoff.z]]}
            color="#9fb3d9"
            lineWidth={1.6}
            dashed
            dashSize={0.18}
            gapSize={0.13}
          />
          {runInfo.dots.map((p, i) => (
            <mesh key={i} rotation-x={-Math.PI / 2} position={[p.x, 0.016, p.z]}>
              <ringGeometry args={[0.05, 0.085, 20]} />
              <meshBasicMaterial color="#9fb3d9" transparent opacity={0.8} depthWrite={false} />
            </mesh>
          ))}
          <Chip
            position={[attackerPos.x + (takeoff.x - attackerPos.x) * 0.42, 0.16, attackerPos.z + (takeoff.z - attackerPos.z) * 0.42]}
            text={`助跑 ${runInfo.d.toFixed(1)}m · ${runInfo.steps} 步 · 腾空 ${motion.airSpeed.toFixed(1)}m/s`}
            level="ok"
          />
          <Chip position={[attackerPos.x, 2.32, attackerPos.z]} text={`${timing.label} ${timing.value}`} level={timing.level} />
        </group>
      )}

      {/* 击飞过网余量标签 */}
      {clearance && netCross && (
        <Chip
          position={[0, netCross.y + 0.2, netCross.z]}
          text={`${clearance.label} ${clearance.value}`}
          level={clearance.level}
        />
      )}
    </group>
  )
}
