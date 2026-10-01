import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { fitCourtPosition } from '../logic/cameraFraming'

const views = [
  { name: '全景', pos: [13.5, 8.5, 12.5] as [number, number, number], target: [0, 1.2, 4.5] as [number, number, number] },
  { name: '俯视', pos: [0.02, 24, 4.6] as [number, number, number], target: [0, 0, 4.5] as [number, number, number] },
]

it.each(views)('$name 在手机竖屏、横屏及桌面均完整容纳球场和网上空间', ({ pos, target }) => {
  for (const aspect of [320 / 440, 390 / 640, 430 / 680, 844 / 245, 908 / 570]) {
    const fitted = fitCourtPosition(pos, target, aspect)
    const camera = new PerspectiveCamera(50, aspect, 0.1, 200)
    camera.position.set(...fitted)
    camera.lookAt(...target)
    camera.updateMatrixWorld()
    for (const x of [-9.4, 9.4]) for (const y of [0, 3.6]) for (const z of [-0.4, 9.4]) {
      const projected = new Vector3(x, y, z).project(camera)
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 / 1.08 + 1e-8)
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 / 1.08 + 1e-8)
      expect(projected.z).toBeLessThan(1)
    }
  }
})

it('竖屏适当后退且始终保持预设视线方向', () => {
  const { pos, target } = views[0]
  const portrait = new Vector3(...fitCourtPosition(pos, target, 0.5)).sub(new Vector3(...target))
  const landscape = new Vector3(...fitCourtPosition(pos, target, 2)).sub(new Vector3(...target))
  expect(portrait.length()).toBeGreaterThan(landscape.length())
  expect(portrait.normalize().distanceTo(landscape.normalize())).toBeLessThan(1e-8)
})
