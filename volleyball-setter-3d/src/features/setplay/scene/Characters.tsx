import { sampleSetterPose, setterYaw } from '../../../logic/setterMotion'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import type { PlayerState, Vec2 } from '../../../types'
import { useSceneStore } from '../../../store/sceneStore'
import { useUiStore } from '../../../store/uiStore'
import { playback } from '../animation'
import { beginGroundDrag, clampToCourt } from './dragManager'
import { makeNumberTexture } from './textures'
import { planAttacker, RIG, sampleAttacker, type AttackerFrame } from './attackerMotion'
import {
  copyPose,
  createScratchPose,
  damp,
  dampAngle,
  POSES,
  type Pose,
  type PoseName,
} from './poses'

const SKIN_TONES = ['#e8b48c', '#d9a074', '#c98d5f', '#b87a4e', '#e0ab80', '#d29a6d']
const HAIR_COLORS = ['#221a14', '#2e2218', '#171310', '#3a2a1a', '#241c16', '#1c1610']
const JERSEY = '#2456b8'
const JERSEY_LIBERO = '#f2b53d'
const SHORTS = '#16305f'
const SHOE = '#eef1f6'
const SOLE = '#2b3140'
const KNEEPAD = '#dfe3ec'
const SOCK = '#f2f4f8'

/** 躯干车削轮廓（半径, 高度）：腰部收窄、胸肩加宽的运动员体格 */
const TORSO_PROFILE = [
  [0.105, 0],
  [0.128, 0.045],
  [0.142, 0.13],
  [0.155, 0.24],
  [0.16, 0.33],
  [0.147, 0.4],
  [0.095, 0.46],
  [0.06, 0.49],
  [0.056, 0.51],
].map(([x, y]) => new THREE.Vector2(x, y))

type HairStyle = 'crop' | 'bun' | 'band'
const HAIR_STYLES: HairStyle[] = ['crop', 'bun', 'band', 'crop', 'bun', 'crop']


interface PlayersProps {
  flightT: number
  attackT: number
  target: Vec2
  contactH: number
}

export function Players({ flightT, attackT, target, contactH }: PlayersProps) {
  const players = useSceneStore((s) => s.players)
  const setterId = useSceneStore((s) => s.setterId)
  const attackerId = useSceneStore((s) => s.attackerId)
  const povMode = useUiStore((s) => s.cameraMode === 'pov')

  return (
    <group>
      {players.map((p, i) => (
        <Character
          key={p.id}
          player={p}
          index={i}
          isSetter={p.id === setterId}
          isAttacker={p.id === attackerId}
          hidden={povMode && p.id === setterId}
          flightT={flightT}
          attackT={attackT}
          target={target}
          contactH={contactH}
        />
      ))}
    </group>
  )
}

interface CharacterProps {
  player: PlayerState
  index: number
  isSetter: boolean
  isAttacker: boolean
  hidden: boolean
  flightT: number
  attackT: number
  target: Vec2
  contactH: number
}

function Character({ player, index, isSetter, isAttacker, hidden, flightT, target, contactH }: CharacterProps) {
  const root = useRef<THREE.Group>(null)
  const facing = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const shoulderL = useRef<THREE.Group>(null)
  const shoulderR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)
  const hipL = useRef<THREE.Group>(null)
  const hipR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)

  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const setPlayerPos = useSceneStore((s) => s.setPlayerPos)
  const setDragging = useUiStore((s) => s.setDragging)

  const skin = SKIN_TONES[index % SKIN_TONES.length]
  const hair = HAIR_COLORS[index % HAIR_COLORS.length]
  const hairStyle = HAIR_STYLES[index % HAIR_STYLES.length]
  const libero = player.role === 'L'
  const jersey = libero ? JERSEY_LIBERO : JERSEY
  const numberTex = useMemo(() => makeNumberTexture(player.number), [player.number])

  const current = useRef<Pose>(createScratchPose())
  const scratch = useRef<Pose>(createScratchPose())
  const yawRef = useRef<number>(isSetter ? Math.PI / 2 : -Math.PI / 2)

  const params = useSceneStore(s => s.params)
  const attackerPlan = useMemo(() => planAttacker(player.pos, target, contactH, flightT, params.approachSteps, player.rotationZone),
    [player.pos, player.rotationZone, target, contactH, flightT, params.approachSteps])
  const attackerFrame = useRef<AttackerFrame>({ x: player.pos.x, z: player.pos.z, yaw: -Math.PI / 2 })

  // 计算本帧目标姿态（时间轴：hold → flight(传球) → attack(击球飞出) → tail）
  const targetPose = (time: number, out: Pose): Pose => {
    const base = (n: PoseName): Pose => POSES[n] as unknown as Pose
    if (isSetter) {
      return sampleSetterPose(playback.t, params.releaseH, params.setDirection, out, playback.hold)
    }
    // 其他球员：轻微呼吸起伏
    copyPose(out, base(libero ? 'receive' : 'idle'))
    out.rootY += Math.sin(time * 1.8 + index * 1.7) * 0.012
    out.shoulderLX += Math.sin(time * 1.3 + index) * 0.04
    out.shoulderRX += Math.sin(time * 1.3 + index + 2) * 0.04
    return out
  }

  useFrame((state, dt) => {
    const g = root.current
    if (!g) return
    const time = state.clock.elapsedTime

    const cur = current.current
    let desiredYaw = -Math.PI / 2
    if (isAttacker && !isSetter) {
      sampleAttacker(attackerPlan, playback.t, cur, attackerFrame.current)
      const frame = attackerFrame.current
      // 地面位移在世界坐标中应用，只有人物身体随朝向旋转。
      g.position.set(frame.x, 0, frame.z)
      desiredYaw = frame.yaw
      yawRef.current = desiredYaw
    } else {
      g.position.set(player.pos.x, 0, player.pos.z)
      const tgt = targetPose(time, scratch.current)
      if (isSetter) {
        desiredYaw = setterYaw(player.pos, target, params.setDirection)
        copyPose(cur, tgt)
        yawRef.current = desiredYaw
      } else {
        const keys = Object.keys(tgt) as (keyof Pose)[]
        for (const k of keys) cur[k] = damp(cur[k], tgt[k], 14, dt)
        yawRef.current = dampAngle(yawRef.current, desiredYaw, 6, dt)
      }
    }
    if (facing.current) facing.current.rotation.y = yawRef.current
    if (body.current) body.current.position.y = cur.rootY
    if (torso.current) torso.current.rotation.x = cur.torso
    // 肢体均沿 -Y 方向生长：绕 X 轴 +角度 = 向身后摆，因此姿势定义的"向前"角度在应用时取反
    if (shoulderL.current) {
      shoulderL.current.rotation.x = -cur.shoulderLX
      shoulderL.current.rotation.z = cur.shoulderLZ
    }
    if (shoulderR.current) {
      shoulderR.current.rotation.x = -cur.shoulderRX
      shoulderR.current.rotation.z = cur.shoulderRZ
    }
    if (elbowL.current) elbowL.current.rotation.x = -cur.elbowL
    if (elbowR.current) elbowR.current.rotation.x = -cur.elbowR
    if (hipL.current) hipL.current.rotation.x = -cur.hipL
    if (hipR.current) hipR.current.rotation.x = -cur.hipR
    if (kneeL.current) kneeL.current.rotation.x = -cur.kneeL
    if (kneeR.current) kneeR.current.rotation.x = -cur.kneeR
  })

  const onDragStart = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation()
    setDragging(true)
    beginGroundDrag(
      camera,
      gl.domElement,
      (p) => {
        const c = clampToCourt(p.x, p.z)
        setPlayerPos(player.id, c)
      },
      () => setDragging(false),
    )
  }

  return (
    <group
      ref={root}
      position={[player.pos.x, 0, player.pos.z]}
      visible={!hidden}
      onPointerDown={(e) => onDragStart(e)}
    >
      <group ref={facing}>
      <group ref={body}>
        <group position={[0, RIG.hipY, 0]}>
          {/* 髋部 / 短裤 */}
          <mesh castShadow position={[0, 0.03, 0]}>
            <capsuleGeometry args={[0.125, 0.09, 6, 16]} />
            <meshStandardMaterial color={SHORTS} roughness={0.75} />
          </mesh>

          {/* 躯干（车削曲面 + 三角肌 + 号码） */}
          <group ref={torso} position={[0, RIG.torsoY, 0]}>
            <mesh castShadow>
              <latheGeometry args={[TORSO_PROFILE, 28]} />
              <meshStandardMaterial color={jersey} roughness={0.68} />
            </mesh>
            <mesh castShadow position={[0.175, 0.435, 0]}>
              <sphereGeometry args={[0.062, 14, 12]} />
              <meshStandardMaterial color={jersey} roughness={0.68} />
            </mesh>
            <mesh castShadow position={[-0.175, 0.435, 0]}>
              <sphereGeometry args={[0.062, 14, 12]} />
              <meshStandardMaterial color={jersey} roughness={0.68} />
            </mesh>
            {/* 胸前/背后号码 */}
            <mesh position={[0, 0.3, 0.158]}>
              <planeGeometry args={[0.14, 0.14]} />
              <meshStandardMaterial map={numberTex} transparent roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
            <mesh position={[0, 0.3, -0.158]} rotation-y={Math.PI}>
              <planeGeometry args={[0.14, 0.14]} />
              <meshStandardMaterial map={numberTex} transparent roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
            </mesh>

            {/* 颈部 + 头（五官/发型/头带） */}
            <mesh castShadow position={[0, 0.555, 0]}>
              <cylinderGeometry args={[0.042, 0.05, 0.09, 12]} />
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
            <group position={[0, 0.645, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.106, 26, 20]} />
                <meshStandardMaterial color={skin} roughness={0.55} />
              </mesh>
              {/* 眼睛与眉毛 */}
              {[0.04, -0.04].map((x) => (
                <mesh key={`e${x}`} position={[x, 0.002, 0.098]}>
                  <sphereGeometry args={[0.013, 10, 8]} />
                  <meshStandardMaterial color="#20242c" roughness={0.3} />
                </mesh>
              ))}
              {[0.04, -0.04].map((x, i) => (
                <mesh key={`b${x}`} position={[x, 0.048, 0.094]} rotation-z={i === 0 ? -0.15 : 0.15}>
                  <boxGeometry args={[0.036, 0.009, 0.012]} />
                  <meshStandardMaterial color={hair} roughness={0.8} />
                </mesh>
              ))}
              {/* 发型：短发 / 发髻 / 头带（帽沿收在眉线以上，避免遮挡五官） */}
              {hairStyle === 'crop' && (
                <mesh castShadow position={[0, 0.03, -0.012]} rotation-x={-0.22}>
                  <sphereGeometry args={[0.112, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
                  <meshStandardMaterial color={hair} roughness={0.85} />
                </mesh>
              )}
              {hairStyle === 'bun' && (
                <>
                  <mesh castShadow position={[0, 0.03, -0.012]} rotation-x={-0.22}>
                    <sphereGeometry args={[0.112, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
                    <meshStandardMaterial color={hair} roughness={0.85} />
                  </mesh>
                  <mesh castShadow position={[0, 0.055, -0.105]}>
                    <sphereGeometry args={[0.048, 14, 12]} />
                    <meshStandardMaterial color={hair} roughness={0.85} />
                  </mesh>
                </>
              )}
              {hairStyle === 'band' && (
                <>
                  <mesh castShadow position={[0, 0.034, -0.012]} rotation-x={-0.18}>
                    <sphereGeometry args={[0.111, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
                    <meshStandardMaterial color={hair} roughness={0.85} />
                  </mesh>
                  <mesh position={[0, 0.026, 0]} rotation-x={Math.PI / 2}>
                    <torusGeometry args={[0.1, 0.017, 10, 26]} />
                    <meshStandardMaterial color={jersey} roughness={0.6} />
                  </mesh>
                </>
              )}
            </group>

            {/* 左臂（袖 + 小臂 + 手） */}
            <group ref={shoulderL} position={[RIG.shoulderX, RIG.shoulderY, 0]}>
              <mesh castShadow position={[0, -0.12, 0]}>
                <capsuleGeometry args={[0.056, 0.15, 4, 12]} />
                <meshStandardMaterial color={jersey} roughness={0.68} />
              </mesh>
              <group ref={elbowL} position={[0, -RIG.upperArm, 0]}>
                <mesh castShadow position={[0, -0.115, 0]}>
                  <capsuleGeometry args={[0.044, 0.14, 4, 12]} />
                  <meshStandardMaterial color={skin} roughness={0.55} />
                </mesh>
                <mesh position={[0, -RIG.forearm, 0]}>
                  <sphereGeometry args={[RIG.handRadius, 12, 10]} />
                  <meshStandardMaterial color={skin} roughness={0.55} />
                </mesh>
              </group>
            </group>

            {/* 右臂 */}
            <group ref={shoulderR} position={[-RIG.shoulderX, RIG.shoulderY, 0]}>
              <mesh castShadow position={[0, -0.12, 0]}>
                <capsuleGeometry args={[0.056, 0.15, 4, 12]} />
                <meshStandardMaterial color={jersey} roughness={0.68} />
              </mesh>
              <group ref={elbowR} position={[0, -RIG.upperArm, 0]}>
                <mesh castShadow position={[0, -0.115, 0]}>
                  <capsuleGeometry args={[0.044, 0.14, 4, 12]} />
                  <meshStandardMaterial color={skin} roughness={0.55} />
                </mesh>
                <mesh position={[0, -RIG.forearm, 0]}>
                  <sphereGeometry args={[RIG.handRadius, 12, 10]} />
                  <meshStandardMaterial color={skin} roughness={0.55} />
                </mesh>
              </group>
            </group>
          </group>

          {/* 腿（裤腿 + 大腿 + 护膝 + 小腿 + 球袜 + 球鞋） */}
          <group ref={hipL} position={[0.095, -0.02, 0]}>
            <mesh castShadow position={[0, -0.21, 0]}>
              <capsuleGeometry args={[0.068, 0.26, 4, 12]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.085, 0.08, 0.13, 14]} />
              <meshStandardMaterial color={SHORTS} roughness={0.75} />
            </mesh>
            <group ref={kneeL} position={[0, -0.44, 0]}>
              <mesh castShadow position={[0, -0.02, 0.02]}>
                <capsuleGeometry args={[0.062, 0.08, 4, 12]} />
                <meshStandardMaterial color={KNEEPAD} roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.05, 0.22, 4, 12]} />
                <meshStandardMaterial color={skin} roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.315, 0]}>
                <cylinderGeometry args={[0.053, 0.053, 0.1, 12]} />
                <meshStandardMaterial color={SOCK} roughness={0.8} />
              </mesh>
              <mesh castShadow position={[0, -0.4, 0.045]}>
                <boxGeometry args={[0.105, 0.062, 0.2]} />
                <meshStandardMaterial color={SHOE} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.442, 0.045]}>
                <boxGeometry args={[0.115, 0.028, 0.215]} />
                <meshStandardMaterial color={SOLE} roughness={0.6} />
              </mesh>
            </group>
          </group>
          <group ref={hipR} position={[-0.095, -0.02, 0]}>
            <mesh castShadow position={[0, -0.21, 0]}>
              <capsuleGeometry args={[0.068, 0.26, 4, 12]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.085, 0.08, 0.13, 14]} />
              <meshStandardMaterial color={SHORTS} roughness={0.75} />
            </mesh>
            <group ref={kneeR} position={[0, -0.44, 0]}>
              <mesh castShadow position={[0, -0.02, 0.02]}>
                <capsuleGeometry args={[0.062, 0.08, 4, 12]} />
                <meshStandardMaterial color={KNEEPAD} roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.05, 0.22, 4, 12]} />
                <meshStandardMaterial color={skin} roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.315, 0]}>
                <cylinderGeometry args={[0.053, 0.053, 0.1, 12]} />
                <meshStandardMaterial color={SOCK} roughness={0.8} />
              </mesh>
              <mesh castShadow position={[0, -0.4, 0.045]}>
                <boxGeometry args={[0.105, 0.062, 0.2]} />
                <meshStandardMaterial color={SHOE} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.442, 0.045]}>
                <boxGeometry args={[0.115, 0.028, 0.215]} />
                <meshStandardMaterial color={SOLE} roughness={0.6} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      </group>

      {/* 选中高亮环 */}
      {isSetter || isAttacker ? (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.013, 0]}>
          <ringGeometry args={[0.3, 0.4, 40]} />
          <meshBasicMaterial
            color={isSetter ? '#ffc83d' : '#7fd4ff'}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      {/* 头顶号码浮标 */}
      <Billboard position={[0, 2.02, 0]}>
        <mesh>
          <planeGeometry args={[0.26, 0.26]} />
          <meshBasicMaterial map={numberTex} transparent depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
