import { afterEach, expect, it } from 'vitest'
import * as THREE from 'three'
import { sampleSetterPose, sampleSetterView, setterYaw } from '../logic/setterMotion'
import { RIG } from '../logic/rig'
import { createScratchPose } from '../features/setplay/scene/poses'
import { useUiStore } from '../store/uiStore'

const saved = useUiStore.getState()
afterEach(() => useUiStore.setState(saved))
const setter = { x: 0.7, z: 1.6 }
const target = { x: 1, z: 7 }

it.each(['front', 'back'] as const)('%s 相机眼位与渲染头部一致，拖动进度也无位置滞后', direction => {
  for (const height of [1.8, 2.2, 2.6]) {
    for (const t of [0, 0.35, 0.6, 0.8, 1.1, 0.4]) {
      const pose = sampleSetterPose(t, height, direction, createScratchPose())
      const root = new THREE.Group()
      root.position.set(setter.x, pose.rootY, setter.z)
      root.rotation.y = setterYaw(setter, target, direction)
      const torso = new THREE.Group()
      torso.position.y = RIG.hipY + RIG.torsoY
      torso.rotation.x = pose.torso
      root.add(torso)
      const eye = new THREE.Object3D()
      eye.position.set(0, RIG.headY + RIG.eyeY, RIG.eyeZ)
      torso.add(eye)
      root.updateMatrixWorld(true)
      const actualEye = eye.getWorldPosition(new THREE.Vector3())
      const view = sampleSetterView(setter, target, height, direction, t, createScratchPose())
      expect(actualEye.distanceTo(new THREE.Vector3(view.eye.x, view.eye.y, view.eye.z))).toBeLessThan(1e-10)
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(eye.matrixWorld)
      expect(forward.distanceTo(new THREE.Vector3(view.forward.x, view.forward.y, view.forward.z))).toBeLessThan(1e-10)
    }
  }
})

it('跳传抬高眼位、低出手降低眼位，背传默认正面背向攻手', () => {
  const view = (h: number, d: 'front' | 'back' = 'front') => sampleSetterView(setter, target, h, d, 0.6, createScratchPose())
  expect(view(2.6).eye.y - view(1.8).eye.y).toBeCloseTo(0.8, 9)
  const front = view(2.2).forward
  const back = view(2.2, 'back').forward
  const dot = (v: typeof front) => v.x * (target.x - setter.x) + v.z * (target.z - setter.z)
  expect(dot(front)).toBeGreaterThan(0)
  expect(dot(back)).toBeLessThan(0)
})

it('自由观察与自动跟球独立切换，回正恢复自动跟球，退出仍能恢复所选方式', () => {
  const ui = useUiStore.getState()
  ui.setCameraMode('pov')
  ui.setPovLookMode('free')
  ui.setPanelOpen(false)
  expect(useUiStore.getState()).toMatchObject({ cameraMode: 'pov', povLookMode: 'free' })
  ui.setCameraMode('orbit')
  ui.setCameraMode('pov')
  expect(useUiStore.getState().povLookMode).toBe('free')
  ui.resetPov()
  expect(useUiStore.getState()).toMatchObject({ cameraMode: 'pov', povLookMode: 'auto' })
})
