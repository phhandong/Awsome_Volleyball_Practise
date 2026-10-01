import { describe, expect, it } from 'vitest'
import { attackerReachOf, evaluateQuality, offNetBandOf } from '../logic/quality'
import { computeAttackRoute, solveByApex } from '../logic/trajectory'
import type { SolveResult, Vec2 } from '../types'

/** 构造一条从二传 (0.7, 2.2, 1.6) 到目标的传球轨迹 */
function passTo(target: Vec2, contactH: number, apexH: number): SolveResult {
  return solveByApex({ x: 0.7, y: 2.2, z: 1.6 }, { x: target.x, y: contactH, z: target.z }, apexH)
}

function evalFor(opts: {
  target: Vec2
  contactH: number
  apexH?: number
  attackerPos: Vec2
  attackerRole?: 'S' | 'OH' | 'MB' | 'OP' | 'L'
  styleId?: null
}) {
  const pass = passTo(opts.target, opts.contactH, opts.apexH ?? 3.4)
  if (pass.status !== 'ok') throw new Error('pass solve failed: ' + ('message' in pass ? pass.message : ''))
  const attack = computeAttackRoute(pass.traj)
  return evaluateQuality({
    pass: pass.traj,
    attack: attack.traj,
    attacker: { pos: opts.attackerPos, role: opts.attackerRole ?? 'OH' },
    setterPos: { x: 0.7, z: 1.6 },
    styleId: opts.styleId ?? null,
  })
}

const item = (r: ReturnType<typeof evaluateQuality>, key: string) => {
  const it = r.items.find((i) => i.key === key)
  if (!it) throw new Error('missing item ' + key)
  return it
}

describe('evaluateQuality 默认场景', () => {
  // 攻手 OH 在 4 号位附近，目标 0.95m 离网、击球高 2.85m，弧顶 3.4m
  const r = evalFor({ target: { x: 0.95, z: 7.0 }, contactH: 2.85, attackerPos: { x: 1.0, z: 7.4 } })

  it('无违例、无红色风险项', () => {
    expect(item(r, 'rule').level).toBe('ok')
    expect(r.level).not.toBe('bad')
    expect(r.score).toBeGreaterThanOrEqual(60)
  })

  it('离网 0.95m 在标准区', () => {
    expect(item(r, 'offnet').level).toBe('ok')
    expect(r.offNetBand).toEqual([0.5, 1.2])
  })

  it('人球节奏 Δ 为正且不超上限', () => {
    const t = item(r, 'timing')
    expect(t.level).toBe('ok')
    expect(r.timingDelta).toBeGreaterThan(0)
  })

  it('击球高度 2.85 低于 OH 摸高窗口', () => {
    expect(item(r, 'contact').level).toBe('ok')
    expect(r.attackerReach).toBeCloseTo(3.2, 5)
  })
})

describe('离网距离 band', () => {
  it('贴网 <0.3m 红色', () => {
    const r = evalFor({ target: { x: 0.25, z: 7.0 }, contactH: 2.85, attackerPos: { x: 1.0, z: 7.4 } })
    expect(item(r, 'offnet').level).toBe('bad')
    expect(r.level).toBe('bad')
  })

  it('负节奏使用远网标准区', () => {
    expect(offNetBandOf('neg', false)).toEqual([2.2, 4.6])
    expect(offNetBandOf(null, false)).toEqual([0.5, 1.2])
    expect(offNetBandOf(null, true)).toEqual([3.3, 7.2])
  })

  it('后排攻手使用后场标准区', () => {
    const r = evalFor({ target: { x: 4.2, z: 1.5 }, contactH: 3.0, apexH: 4.3, attackerPos: { x: 4.6, z: 1.3 } })
    expect(r.offNetBand).toEqual([3.3, 7.2])
    expect(item(r, 'offnet').level).toBe('ok')
  })
})

describe('人球节奏', () => {
  it('攻手太远时球先到（红色）', () => {
    const r = evalFor({ target: { x: 0.95, z: 7.0 }, contactH: 2.85, attackerPos: { x: 8.5, z: 4.5 } })
    const t = item(r, 'timing')
    expect(t.level).toBe('bad')
    expect(r.timingDelta).toBeLessThan(0)
  })

  it('等球过久（黄色，风格上限）', () => {
    // 一节奏允许等球 0.15s：二传就在目标旁边、攻手也不远 → Δ 大
    const r = evalFor({
      target: { x: 0.95, z: 7.0 },
      contactH: 2.7,
      apexH: 2.8,
      attackerPos: { x: 1.2, z: 7.0 },
    })
    const t = item(r, 'timing')
    if (r.timingDelta > 0.15) expect(t.level).toBe('warn')
    else expect(t.level).toBe('ok')
  })
})

describe('击球高度 vs 摸高', () => {
  it('超出摸高红色', () => {
    const r = evalFor({ target: { x: 0.95, z: 7.0 }, contactH: 3.3, apexH: 4.6, attackerPos: { x: 1.0, z: 7.4 } })
    expect(item(r, 'contact').level).toBe('bad')
  })

  it('超手窗口绿色', () => {
    const r = evalFor({ target: { x: 0.95, z: 7.0 }, contactH: 3.1, apexH: 4.2, attackerPos: { x: 1.0, z: 7.4 } })
    expect(item(r, 'contact').level).toBe('ok')
  })

  it('副攻摸高 3.35m', () => {
    expect(attackerReachOf('MB')).toBeCloseTo(3.35, 5)
  })
})

describe('规则违例', () => {
  it('自由人不得进攻', () => {
    const r = evalFor({
      target: { x: 0.95, z: 7.0 },
      contactH: 2.85,
      attackerPos: { x: 6.2, z: 4.5 },
      attackerRole: 'L',
    })
    expect(item(r, 'rule').level).toBe('bad')
    expect(r.level).toBe('bad')
  })

  it('后排队员前场扣高于网的球 = 违例风险', () => {
    const r = evalFor({
      target: { x: 1.0, z: 1.0 },
      contactH: 2.85,
      attackerPos: { x: 4.6, z: 1.3 },
    })
    expect(item(r, 'rule').level).toBe('bad')
    expect(item(r, 'rule').value).toContain('后排违例')
  })

  it('后排队员后场进攻合法', () => {
    const r = evalFor({
      target: { x: 4.2, z: 1.5 },
      contactH: 3.0,
      apexH: 4.3,
      attackerPos: { x: 4.6, z: 1.3 },
    })
    expect(item(r, 'rule').level).toBe('ok')
  })
})
