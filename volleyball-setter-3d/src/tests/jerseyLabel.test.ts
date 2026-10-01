import { describe, expect, it } from 'vitest'
import { createJerseyLabelSurface, torsoRadiusAt } from '../logic/jerseyLabel'

describe('球衣职能文字曲面', () => {
  const surface = createJerseyLabelSurface()

  it('每个顶点都在躯干外侧，胸背共用相同的安全间隙', () => {
    for (let i = 0; i < surface.positions.length; i += 3) {
      const [x, y, z] = surface.positions.slice(i, i + 3)
      const bodyRadius = torsoRadiusAt(y)
      expect(Math.hypot(x, z) - bodyRadius).toBeCloseTo(0.0015, 6)
      expect(Math.hypot(-x, -z)).toBeGreaterThan(bodyRadius)
      expect(z).toBeGreaterThan(0)
    }
  })

  it('完整覆盖原文字尺寸，UV 不裁切或镜像', () => {
    for (let i = 0; i < surface.positions.length / 3; i++) {
      const x = surface.positions[i * 3]
      const y = surface.positions[i * 3 + 1]
      expect(surface.uvs[i * 2]).toBeCloseTo(x / 0.28 + 0.5, 6)
      expect(surface.uvs[i * 2 + 1]).toBeCloseTo((y - 0.265) / 0.07, 6)
    }
    expect(surface.uvs[0]).toBe(0)
    expect(surface.uvs[surface.uvs.length - 2]).toBe(1)
    expect(surface.uvs[surface.uvs.length - 1]).toBe(1)
  })

  it('所有三角形均朝向外侧，保持身体正常遮挡', () => {
    for (let i = 0; i < surface.indices.length; i += 3) {
      const [a, b, c] = surface.indices.slice(i, i + 3).map(n => n * 3)
      const abX = surface.positions[b] - surface.positions[a]
      const abY = surface.positions[b + 1] - surface.positions[a + 1]
      const acX = surface.positions[c] - surface.positions[a]
      const acY = surface.positions[c + 1] - surface.positions[a + 1]
      expect(abX * acY - abY * acX).toBeGreaterThan(0)
    }
  })
})
