import { describe, expect, it } from 'vitest'
import { generateRoutes, STYLES } from '../logic/presets'
import { DEFAULT_FORMATION } from '../logic/court'
import type { PlayerState } from '../types'

function toPlayer(f: (typeof DEFAULT_FORMATION)[number]): PlayerState {
  return { ...f }
}

const setter = toPlayer(DEFAULT_FORMATION[0])
const attacker = toPlayer(DEFAULT_FORMATION[1])

describe('generateRoutes', () => {
  const routes = generateRoutes(setter, attacker)

  it('五种风格各产出至多 3 个候选且分数降序', () => {
    for (const style of STYLES) {
      const list = routes[style.id]
      expect(list.length).toBeGreaterThan(0)
      expect(list.length).toBeLessThanOrEqual(3)
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score)
      }
    }
  })

  it('候选参数落在合理范围', () => {
    for (const style of STYLES) {
      for (const c of routes[style.id]) {
        expect(c.params.target.x).toBeGreaterThan(0)
        expect(c.params.target.x).toBeLessThan(9)
        expect(c.params.target.z).toBeGreaterThan(0)
        expect(c.params.target.z).toBeLessThan(9)
        expect(c.params.apexH).toBeGreaterThan(2.5)
        expect(c.metrics.flightT).toBeGreaterThan(0.2)
        expect(c.metrics.flightT).toBeLessThan(8)
        expect(c.score).toBeGreaterThanOrEqual(0)
        expect(c.score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('一节奏候选飞行时间明显短于三节奏', () => {
    const t1 = routes.t1[0].metrics.flightT
    const t3 = routes.t3[0].metrics.flightT
    expect(t1).toBeLessThan(t3)
  })

  it('背传候选目标在二传身后（z 更小或 x 更大）', () => {
    const back = routes.back[0]
    const behind =
      back.params.target.z < setter.pos.z - 0.3 || back.params.target.x > setter.pos.x + 0.2
    expect(behind).toBe(true)
  })

  it('风格定义齐全', () => {
    expect(STYLES.map((s) => s.id)).toEqual(['t1', 't2', 't3', 'neg', 'back'])
  })
})
