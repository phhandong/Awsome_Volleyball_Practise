import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useSceneStore } from '../../../store/sceneStore'
import { useUiStore, type ViewPreset } from '../../../store/uiStore'
import { ballWorld, phaseAt, playback } from '../animation'

const PRESETS: Record<ViewPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  coach: { pos: [13.5, 8.5, 12.5], target: [0, 1.2, 4.5] },
  baseline: { pos: [15.5, 3.2, 4.5], target: [-2, 1.6, 4.5] },
  side: { pos: [5, 3, -8.5], target: [0, 1.4, 4.5] },
  top: { pos: [0.02, 24, 4.6], target: [0, 0, 4.5] },
}

const UP = new THREE.Vector3(0, 1, 0)
const easeOut = (k: number): number => 1 - (1 - k) ** 3
const easeInOut = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** 相机系统：轨道模式（预设机位阻尼过渡）+ 二传第一人称（真人视野 FOV、跟球/环视） */
export function CameraRig({ flightT, attackT }: { flightT: number; attackT: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const cameraMode = useUiStore((s) => s.cameraMode)
  const viewPreset = useUiStore((s) => s.viewPreset)
  const viewNonce = useUiStore((s) => s.viewNonce)
  const dragging = useUiStore((s) => s.dragging)
  const setter = useSceneStore((s) => s.players.find((p) => p.id === s.setterId)!)
  const params = useSceneStore((s) => s.params)

  const controlsRef = useRef<OrbitControlsImpl>(null)
  const [busy, setBusy] = useState(false)

  const anim = useRef<{
    fromP: THREE.Vector3
    fromT: THREE.Vector3
    toP: THREE.Vector3
    toT: THREE.Vector3
    t: number
  } | null>(null)
  const trans = useRef<{ t: number; fromP: THREE.Vector3; fromQ: THREE.Quaternion; toPov: boolean } | null>(null)
  const exitPose = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const pov = useRef({ yawOff: 0, pitchOff: 0 })
  const povPointer = useRef({ down: false, x: 0, y: 0 })
  const smoothLook = useRef(new THREE.Vector3(0, 2.5, 4.5))

  const tmp = useMemo(
    () => ({
      eye: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      look: new THREE.Vector3(),
      desiredQ: new THREE.Quaternion(),
      m: new THREE.Matrix4(),
      v: new THREE.Vector3(),
    }),
    [],
  )

  // 预设机位触发（含重按重触发）
  useEffect(() => {
    if (cameraMode !== 'orbit') return
    const controls = controlsRef.current
    if (!controls) return
    const p = PRESETS[viewPreset]
    anim.current = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: new THREE.Vector3(...p.pos),
      toT: new THREE.Vector3(...p.target),
      t: 0,
    }
    setBusy(true)
  }, [viewNonce, viewPreset, cameraMode, camera])

  // 用户手动操作打断预设过渡
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const onStart = (): void => {
      anim.current = null
      setBusy(false)
    }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [])

  // 模式切换：进入/退出第一人称
  useEffect(() => {
    if (cameraMode === 'pov') {
      trans.current = { t: 0, fromP: camera.position.clone(), fromQ: camera.quaternion.clone(), toPov: true }
      pov.current.yawOff = 0
      pov.current.pitchOff = 0
      smoothLook.current.set(params.target.x, params.contactH, params.target.z)
    } else {
      const p = PRESETS[viewPreset]
      exitPose.current = { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target) }
      trans.current = { t: 0, fromP: camera.position.clone(), fromQ: camera.quaternion.clone(), toPov: false }
    }
    setBusy(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode])

  // 第一人称环视交互
  useEffect(() => {
    if (cameraMode !== 'pov') return
    const dom = gl.domElement
    const down = (e: PointerEvent): void => {
      povPointer.current = { down: true, x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent): void => {
      if (!povPointer.current.down) return
      const dx = e.clientX - povPointer.current.x
      const dy = e.clientY - povPointer.current.y
      povPointer.current.x = e.clientX
      povPointer.current.y = e.clientY
      pov.current.yawOff -= dx * 0.0035
      pov.current.pitchOff = clamp(pov.current.pitchOff - dy * 0.003, -1.15, 1.15)
    }
    const up = (): void => {
      povPointer.current.down = false
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'f' || e.key === 'F') {
        pov.current.yawOff = 0
        pov.current.pitchOff = 0
      }
    }
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => {
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
    }
  }, [cameraMode, gl])

  useFrame((_, dt) => {
    const controls = controlsRef.current

    // FOV：第一人称用接近真人视野的广角（垂直 75° ≈ 水平 105°），轨道模式 50°
    const targetFov = cameraMode === 'pov' ? 75 : 50
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = clamp(camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-6 * dt)), 20, 110)
      camera.updateProjectionMatrix()
    }

    // 轨道预设过渡
    if (anim.current && controls) {
      const a = anim.current
      a.t += dt
      const k = easeOut(Math.min(1, a.t / 0.85))
      camera.position.lerpVectors(a.fromP, a.toP, k)
      controls.target.lerpVectors(a.fromT, a.toT, k)
      if (k >= 1) {
        anim.current = null
        setBusy(false)
      }
    }

    // 第一人称
    if (cameraMode === 'pov') {
      tmp.eye.set(setter.pos.x, 1.78, setter.pos.z)

      // 视线目标：传球/击飞阶段跟球，其余看传球点
      const ph = phaseAt(flightT, attackT, playback.t)
      if (ph.kind === 'flight' || ph.kind === 'attack') tmp.look.copy(ballWorld)
      else tmp.look.set(params.target.x, params.contactH, params.target.z)
      smoothLook.current.lerp(tmp.look, 1 - Math.exp(-8 * dt))

      // 基础视线方向 + 用户环视偏移
      tmp.dir.subVectors(smoothLook.current, tmp.eye).normalize()
      tmp.dir.applyAxisAngle(UP, pov.current.yawOff)
      tmp.right.crossVectors(tmp.dir, UP).normalize()
      tmp.dir.applyAxisAngle(tmp.right, pov.current.pitchOff)
      tmp.dir.normalize()
      tmp.m.lookAt(tmp.eye, tmp.v.copy(tmp.eye).add(tmp.dir), UP)
      tmp.desiredQ.setFromRotationMatrix(tmp.m)

      const tr = trans.current
      if (tr?.toPov) {
        tr.t += dt
        const k = easeInOut(Math.min(1, tr.t / 0.7))
        camera.position.lerpVectors(tr.fromP, tmp.eye, k)
        camera.quaternion.slerpQuaternions(tr.fromQ, tmp.desiredQ, k)
        if (k >= 1) {
          trans.current = null
          setBusy(false)
        }
      } else {
        camera.position.lerp(tmp.eye, 1 - Math.exp(-14 * dt))
        camera.quaternion.slerp(tmp.desiredQ, 1 - Math.exp(-16 * dt))
      }
    }

    // 退出第一人称：飞回预设机位后交还轨道控制
    if (trans.current && !trans.current.toPov && exitPose.current && controls) {
      const tr = trans.current
      tr.t += dt
      const k = easeInOut(Math.min(1, tr.t / 0.7))
      camera.position.lerpVectors(tr.fromP, exitPose.current.pos, k)
      tmp.m.lookAt(exitPose.current.pos, exitPose.current.target, UP)
      tmp.desiredQ.setFromRotationMatrix(tmp.m)
      camera.quaternion.slerpQuaternions(tr.fromQ, tmp.desiredQ, k)
      if (k >= 1) {
        controls.target.copy(exitPose.current.target)
        trans.current = null
        exitPose.current = null
        setBusy(false)
      }
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={cameraMode === 'orbit' && !dragging && !busy}
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={45}
      maxPolarAngle={Math.PI / 2 - 0.04}
      target={[0, 1.2, 4.5]}
    />
  )
}
