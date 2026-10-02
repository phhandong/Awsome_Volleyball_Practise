import type { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { OrbitControls } from 'three-stdlib'

export interface OrbitView {
  pos: Vector3
  target: Vector3
  quaternion: Quaternion
  fov: number
}

export function restoreOrbitView(camera: PerspectiveCamera, controls: OrbitControls, view: OrbitView) {
  camera.position.copy(view.pos)
  camera.quaternion.copy(view.quaternion)
  controls.target.copy(view.target)
  camera.fov = view.fov
  camera.updateProjectionMatrix()
}

/** Save the visible view and discard residual orbit damping before leaving it. */
export function captureOrbitView(camera: PerspectiveCamera, controls: OrbitControls): OrbitView {
  const view = { pos: camera.position.clone(), target: controls.target.clone(),
    quaternion: camera.quaternion.clone(), fov: camera.fov }
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = damping
  restoreOrbitView(camera, controls, view)
  return view
}
