import * as THREE from 'three'

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const hit = new THREE.Vector3()

/**
 * 通用地面拖拽：pointerdown 后监听窗口事件，将指针射线投到 y=0 平面，
 * 回调世界坐标；pointerup 结束。供球员/目标环拖拽复用。
 */
export function beginGroundDrag(
  camera: THREE.Camera,
  dom: HTMLElement,
  onMove: (p: THREE.Vector3) => void,
  onEnd?: () => void,
): void {
  const onPointerMove = (e: PointerEvent): void => {
    const rect = dom.getBoundingClientRect()
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(groundPlane, hit)) onMove(hit)
  }
  const onPointerUp = (): void => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    onEnd?.()
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

export function clampToCourt(x: number, z: number, margin = 0.3): { x: number; z: number } {
  return {
    x: Math.max(margin, Math.min(9 - margin, x)),
    z: Math.max(margin, Math.min(9 - margin, z)),
  }
}

const verticalPlane = new THREE.Plane()
const camForward = new THREE.Vector3()

/**
 * 竖直拖拽：射线投到"过 origin、正对相机"的竖直平面上，回调三维点。
 * 供拖拽击球高度等仅需要 y 分量的场景复用。
 */
export function beginAxisDrag(
  camera: THREE.Camera,
  dom: HTMLElement,
  origin: THREE.Vector3,
  onMove: (p: THREE.Vector3) => void,
  onEnd?: () => void,
): void {
  camera.getWorldDirection(camForward)
  camForward.y = 0
  if (camForward.lengthSq() < 1e-6) camForward.set(0, 0, 1)
  camForward.normalize()
  verticalPlane.setFromNormalAndCoplanarPoint(camForward, origin)

  const onPointerMove = (e: PointerEvent): void => {
    const rect = dom.getBoundingClientRect()
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(verticalPlane, hit)) onMove(hit)
  }
  const onPointerUp = (): void => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    onEnd?.()
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
