import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three-stdlib'
import { captureOrbitView, restoreOrbitView } from '../logic/orbitView'

it('二传视角往返恢复手动旋转、平移、缩放后的视角，并清除残留阻尼', () => {
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 200)
  camera.position.set(9, 6, -4)
  const controls = new OrbitControls(camera)
  controls.target.set(2, 1.7, 5)
  controls.enableDamping = true
  controls.update()
  controls.setAzimuthalAngle(controls.getAzimuthalAngle() + 0.6)
  const originalPosition = camera.position.clone(), originalQuaternion = camera.quaternion.clone()
  const view = captureOrbitView(camera, controls)
  camera.position.set(0.7, 1.7, 1.6)
  camera.lookAt(new Vector3(-3, 3, 6))
  camera.fov = 75
  controls.target.set(-3, 3, 6)
  restoreOrbitView(camera, controls, view)
  for (let i = 0; i < 60; i++) controls.update()
  expect(camera.position.distanceTo(originalPosition)).toBeLessThan(1e-10)
  expect(1 - Math.abs(camera.quaternion.dot(originalQuaternion))).toBeLessThan(1e-10)
  expect(controls.target.toArray()).toEqual([2, 1.7, 5])
  expect(camera.fov).toBe(50)
  expect(controls.enableDamping).toBe(true)
})

it('每次重新进入都保存最新的轨道视角，快照不随相机变化', () => {
  const camera = new PerspectiveCamera(50)
  camera.position.set(8, 5, 12)
  const controls = new OrbitControls(camera)
  const first = captureOrbitView(camera, controls)
  camera.position.set(-5, 7, 10)
  controls.target.set(1, 2, 3)
  controls.update()
  const second = captureOrbitView(camera, controls)
  restoreOrbitView(camera, controls, first)
  expect(camera.position.distanceTo(new Vector3(8, 5, 12))).toBeLessThan(1e-10)
  restoreOrbitView(camera, controls, second)
  expect(camera.position.distanceTo(new Vector3(-5, 7, 10))).toBeLessThan(1e-10)
  expect(controls.target.toArray()).toEqual([1, 2, 3])
})
