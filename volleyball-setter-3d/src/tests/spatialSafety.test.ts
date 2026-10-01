import { afterEach, expect, it } from 'vitest'
import { planAttacker } from '../logic/approach'
import { attackSpace, NET_BODY_MARGIN } from '../logic/motionSpace'
import { clearApproachLane } from '../logic/formationSpacing'
import { DEFAULT_PARAMS, exportScene, importScene, useSceneStore } from '../store/sceneStore'
import { evaluateQuality } from '../logic/quality'
import { solveByApex } from '../logic/trajectory'
import { setterRelease } from '../logic/setterMotion'

const initial = useSceneStore.getState()
afterEach(() => useSceneStore.setState(initial))

it('修改入口拒绝同一人担任两个角色或无效球员', () => {
  initial.setSetter(initial.attackerId)
  initial.setAttacker(initial.setterId)
  initial.setSetter('missing')
  initial.setAttacker('missing')
  expect(useSceneStore.getState()).toMatchObject({ setterId: initial.setterId, attackerId: initial.attackerId })
  initial.setSetter('p3')
  initial.setAttacker('p4')
  expect(useSceneStore.getState()).toMatchObject({ setterId: 'p3', attackerId: 'p4' })
})

it.each(['same', 'unknown', 'duplicate', 'single'] as const)('导入 %s 无效阵容时给出错误且不修改场景', issue => {
  const scene = JSON.parse(exportScene())
  if (issue === 'same') scene.attackerId = scene.setterId
  if (issue === 'unknown') scene.setterId = 'missing'
  if (issue === 'duplicate') scene.players[1].id = scene.players[0].id
  if (issue === 'single') scene.players = [scene.players[0]]
  const before = exportScene()
  expect(importScene(JSON.stringify(scene))).toBeTypeOf('string')
  expect(exportScene()).toBe(before)
})

it('旧存档省略角色时自动选择两个不同队员', () => {
  expect(importScene(JSON.stringify({ players: initial.players, params: DEFAULT_PARAMS }))).toBeNull()
  const s = useSceneStore.getState()
  expect(s.setterId).not.toBe(s.attackerId)
})

it('自定义球员存档重置阵型后，两名出手角色仍有效且不同', () => {
  const players = initial.players.map(p => ({ ...p, id: `custom-${p.id}` }))
  expect(importScene(JSON.stringify({ players, setterId: 'custom-p1', attackerId: 'custom-p2', params: DEFAULT_PARAMS }))).toBeNull()
  useSceneStore.getState().resetFormation()
  const s = useSceneStore.getState()
  expect(s.players.some(p => p.id === s.setterId)).toBe(true)
  expect(s.players.some(p => p.id === s.attackerId)).toBe(true)
  expect(s.setterId).not.toBe(s.attackerId)
})

function scenario(setter: { x: number; z: number }, stand = { x: 4, z: 5 }, target = { x: 1.1, z: 5 }) {
  const params = { ...DEFAULT_PARAMS, apexH: 4, target }
  const players = initial.players.map(p => ({ ...p, pos: p.id === initial.setterId ? setter : p.id === initial.attackerId ? stand : p.pos }))
  const pass = solveByApex(setterRelease(setter, target, params.releaseH, 'front'), { ...target, y: params.contactH }, params.apexH)
  if (pass.status !== 'ok') throw new Error(pass.message)
  const plan = (pos: typeof stand) => planAttacker(pos, target, params.contactH, pass.traj.flightT, params.approachSteps, 4)
  return { params, players, pass: pass.traj, plan }
}

it('穿过二传的助跑改为相邻方向，保留击球目标和二传位置，重复计算不漂移', () => {
  const setter = { x: 2.6, z: 5 }
  const s = scenario(setter)
  expect(attackSpace(s.plan({ x: 4, z: 5 }), setter).setterConflict).toBe(true)
  const arranged = clearApproachLane(s.players, initial.setterId, initial.attackerId, s.params)
  const attacker = arranged.find(p => p.id === initial.attackerId)!
  expect(attacker.pos).not.toEqual({ x: 4, z: 5 })
  expect(arranged.find(p => p.id === initial.setterId)!.pos).toEqual(setter)
  expect(attackSpace(s.plan(attacker.pos), setter)).toMatchObject({ setterConflict: false, netConflict: false })
  expect(s.params.target).toEqual({ x: 1.1, z: 5 })
  expect(clearApproachLane(arranged, initial.setterId, initial.attackerId, s.params)).toBe(arranged)
})

it('身体接触位置被二传占据时不伪造安全路线，给出具体冲突提示', () => {
  const contact = planAttacker({ x: 4, z: 5 }, { x: 1.1, z: 5 }, 2.85, 1).contactRoot
  const s = scenario(contact)
  const arranged = clearApproachLane(s.players, initial.setterId, initial.attackerId, s.params)
  const attacker = arranged.find(p => p.id === initial.attackerId)!
  expect(attacker.pos).toEqual({ x: 4, z: 5 })
  const report = evaluateQuality({ pass: s.pass, attack: null, attacker, setterPos: contact, styleId: null })
  expect(report.items.find(i => i.key === 'setterSpace')).toMatchObject({ level: 'bad' })
  expect(report.items.find(i => i.key === 'setterSpace')!.hint).toContain('移动二传或击球目标')
})

it('靠网助跑起点优先调整，腾空和落地制动均保留网前空间', () => {
  const setter = { x: 0.7, z: 1.6 }
  const s = scenario(setter, { x: 0.15, z: 6 })
  expect(attackSpace(s.plan({ x: 0.15, z: 6 }), setter).netConflict).toBe(true)
  const arranged = clearApproachLane(s.players, initial.setterId, initial.attackerId, s.params)
  const attacker = arranged.find(p => p.id === initial.attackerId)!
  expect(attackSpace(s.plan(attacker.pos), setter).netDistance).toBeGreaterThanOrEqual(NET_BODY_MARGIN - 1e-6)
})

it('击球身体位置已在网内时明确提示球网冲突', () => {
  const setter = { x: 0.7, z: 1.6 }
  const s = scenario(setter, { x: 4, z: 5 }, { x: 0.05, z: 5 })
  const arranged = clearApproachLane(s.players, initial.setterId, initial.attackerId, s.params)
  const report = evaluateQuality({ pass: s.pass, attack: null,
    attacker: arranged.find(p => p.id === initial.attackerId)!, setterPos: setter, styleId: null })
  expect(report.items.find(i => i.key === 'netSpace')?.level).toBe('bad')
})
