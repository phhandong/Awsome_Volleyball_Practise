import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useSceneStore } from '../../../store/sceneStore'
import { useUiStore, type ViewPreset } from '../../../store/uiStore'
import { ballWorld, playback } from '../animation'
import { fitCourtPosition } from '../../../logic/cameraFraming'
import { captureOrbitView, restoreOrbitView, type OrbitView } from '../../../logic/orbitView'
import { sampleSetterView } from '../../../logic/setterMotion'
import { createScratchPose } from './poses'

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

/** 相机系统：轨道模式（预设机位阻尼过渡）+ 二传第一人称（屏幕视角、跟球/环视） */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const cameraMode = useUiStore((s) => s.cameraMode)
  const viewPreset = useUiStore((s) => s.viewPreset)
  const viewNonce = useUiStore((s) => s.viewNonce)
  const dragging = useUiStore((s) => s.dragging)
  const modal = useUiStore((s) => s.compact && s.panelOpen)
  const povResetNonce = useUiStore((s) => s.povResetNonce)
  const povLookMode = useUiStore((s) => s.povLookMode)
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
  const exitPose = useRef<OrbitView | null>(null)
  const savedOrbit = useRef<OrbitView | null>(null)
  const previousView = useRef<{ mode: typeof cameraMode; nonce: number; preset: ViewPreset; width: number; height: number } | null>(null)
  const pov = useRef({ yawOff: 0, pitchOff: 0 })
  const povPointer = useRef({ down: false, x: 0, y: 0 })
  const smoothLook = useRef(new THREE.Vector3(0, 2.5, 4.5))
  const viewPose = useRef(createScratchPose())
  const freeLook = useRef(new THREE.Vector3(0, 0, 1))
  const lastView = useRef({ mode: cameraMode, setterId: setter.id, direction: params.setDirection })

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

  // 普通退出恢复进入前的视角；只有主动选择机位才触发预设过渡。
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const previous = previousView.current
    previousView.current = { mode: cameraMode, nonce: viewNonce, preset: viewPreset, width: size.width, height: size.height }
    const presetRequested = !previous || previous.nonce !== viewNonce || previous.preset !== viewPreset
    if (cameraMode === 'pov') {
      if (previous?.mode === 'pov') return
      // A quick re-entry during the return flight keeps the original saved view.
      if (!trans.current || trans.current.toPov || !savedOrbit.current) savedOrbit.current = captureOrbitView(camera, controls)
      anim.current = null
      exitPose.current = null
      controls.enabled = false
      trans.current = { t: 0, fromP: camera.position.clone(), fromQ: camera.quaternion.clone(), toPov: true }
      pov.current.yawOff = 0
      pov.current.pitchOff = 0
      smoothLook.current.copy(ballWorld)
      setBusy(true)
      return
    }
    if (previous?.mode === 'pov' && !presetRequested && savedOrbit.current) {
      anim.current = null
      exitPose.current = savedOrbit.current
      controls.enabled = false
      trans.current = { t: 0, fromP: camera.position.clone(), fromQ: camera.quaternion.clone(), toPov: false }
      setBusy(true)
      return
    }
    // POV toolbar changes the canvas height on exit; resizing must not replace the saved view.
    if (!presetRequested && (trans.current || savedOrbit.current)) return
    const resized = previous && (previous.width !== size.width || previous.height !== size.height)
    if (!presetRequested && !resized) return
    trans.current = null
    exitPose.current = null
    savedOrbit.current = null
    const p = PRESETS[viewPreset]
    const position = viewPreset === 'coach' || viewPreset === 'top'
      ? fitCourtPosition(p.pos, p.target, size.width / Math.max(1, size.height)) : p.pos
    anim.current = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: new THREE.Vector3(...position),
      toT: new THREE.Vector3(...p.target),
      t: 0,
    }
    setBusy(true)
  }, [viewNonce, viewPreset, cameraMode, camera, size.width, size.height])

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

  useEffect(() => {
    pov.current.yawOff = 0
    pov.current.pitchOff = 0
  }, [povResetNonce])

  useEffect(() => {
    const last = lastView.current
    const entering = last.mode !== 'pov' && cameraMode === 'pov'
    const actorChanged = last.setterId !== setter.id || last.direction !== params.setDirection
    lastView.current = { mode: cameraMode, setterId: setter.id, direction: params.setDirection }
    if (cameraMode !== 'pov') return
    const view = sampleSetterView(setter.pos, params.target, params.releaseH, params.setDirection, playback.t, viewPose.current, playback.hold)
    if (entering || actorChanged) freeLook.current.set(view.forward.x, view.forward.y, view.forward.z)
    else if (povLookMode === 'free') camera.getWorldDirection(freeLook.current)
    pov.current.yawOff = 0
    pov.current.pitchOff = 0
    smoothLook.current.copy(ballWorld)
  }, [cameraMode, povLookMode, setter.id, setter.pos, params.setDirection, params.target, params.releaseH, camera])

  // 第一人称环视交互
  useEffect(() => {
    if (cameraMode !== 'pov' || modal) return
    const dom = gl.domElement
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 || !e.isPrimary) return
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
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) useUiStore.getState().resetPov()
      }
    }
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    window.addEventListener('keydown', key)
    return () => {
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      window.removeEventListener('keydown', key)
      up()
    }
  }, [cameraMode, gl, modal])

  useFrame((state, dt) => {
    const camera = state.camera as THREE.PerspectiveCamera
    const controls = controlsRef.current

    // 屏幕垂直 FOV：第一人称 75°，轨道模式 50°，水平范围随容器比例变化。
    const targetFov = cameraMode === 'pov' ? 75 : savedOrbit.current?.fov ?? 50
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
      camera.lookAt(controls.target)
      if (k >= 1) {
        anim.current = null
        setBusy(false)
      }
    }

    // 第一人称
    if (cameraMode === 'pov') {
      const view = sampleSetterView(setter.pos, params.target, params.releaseH, params.setDirection, playback.t, viewPose.current, playback.hold)
      tmp.eye.set(view.eye.x, view.eye.y, view.eye.z)
      if (povLookMode === 'auto') {
        // 来球、出手、背传与扣球均看真实球位；背传接球时面向人物正前方。
        smoothLook.current.lerp(ballWorld, 1 - Math.exp(-8 * dt))
        tmp.dir.subVectors(smoothLook.current, tmp.eye).normalize()
      } else tmp.dir.copy(freeLook.current)
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
        camera.position.copy(tmp.eye)
        camera.quaternion.slerp(tmp.desiredQ, 1 - Math.exp(-16 * dt))
      }
    }

    // 退出第一人称：恢复进入前的位置、朝向、观察中心与视野。
    if (trans.current && !trans.current.toPov && exitPose.current && controls) {
      const tr = trans.current
      tr.t += dt
      const k = easeInOut(Math.min(1, tr.t / 0.7))
      camera.position.lerpVectors(tr.fromP, exitPose.current.pos, k)
      camera.quaternion.slerpQuaternions(tr.fromQ, exitPose.current.quaternion, k)
      if (k >= 1) {
        restoreOrbitView(camera, controls, exitPose.current)
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
      enabled={cameraMode === 'orbit' && !dragging && !busy && !modal}
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2 - 0.04}
      target={[0, 1.2, 4.5]}
    />
  )
}
