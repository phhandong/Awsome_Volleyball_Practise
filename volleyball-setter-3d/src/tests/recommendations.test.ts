import { afterEach, expect, it } from 'vitest'
import { generateRoutes, STYLES } from '../logic/presets'
import { setterRelease } from '../logic/setterMotion'
import { solveByApex } from '../logic/trajectory'
import { exportScene, importScene, useSceneStore } from '../store/sceneStore'

const initial = useSceneStore.getState()
afterEach(() => useSceneStore.setState(initial))

function recommendations() {
  const s = useSceneStore.getState()
  return generateRoutes(s.recommendationPlayers.find(p => p.id === s.setterId)!,
    s.recommendationPlayers.find(p => p.id === s.attackerId)!)
}

it.each(STYLES)('$name 的每个条目套用和重复点击后，五组名称、顺序、评分及目标均保持稳定', style => {
  const before = recommendations()
  const basis = useSceneStore.getState().recommendationPlayers
  for (const c of before[style.id]) {
    let appliedStand: {x:number;z:number} | undefined
    for (let repeat = 0; repeat < 3; repeat++) {
      useSceneStore.getState().applyCandidate(c)
      const s = useSceneStore.getState()
      expect(s.recommendationPlayers).toBe(basis)
      expect(recommendations()).toEqual(before)
      expect(s.selectedCandidateId).toBe(c.id)
      expect(s.selectedStyle).toBe(c.styleId)
      expect(s.params).toMatchObject(c.params)
      const stand=s.players.find(p => p.id === s.attackerId)!.pos
      if(repeat===0) appliedStand={...stand}
      expect(stand).toEqual(appliedStand)
      expect(recommendations()[style.id].find(item => item.id === s.selectedCandidateId)).toEqual(c)
    }
  }
})

it('跨五组连续选择再回到 B快，目标和站位不会累计漂移', () => {
  const before = recommendations()
  const bQuick = before.t1.find(c => c.variantName === 'B快')!
  for (const style of STYLES) useSceneStore.getState().applyCandidate(before[style.id][0])
  useSceneStore.getState().applyCandidate(bQuick)
  expect(recommendations()).toEqual(before)
  expect(useSceneStore.getState().params.target).toEqual(bQuick.params.target)
  expect(useSceneStore.getState().players.find(p => p.id === initial.attackerId)?.pos).toEqual(bQuick.stand)
})

it.each(['setter', 'attacker', 'distance', 'zone', 'reset', 'import'] as const)('手动调整 %s 后推荐依据更新，并清除旧条目高亮', change => {
  useSceneStore.getState().applyCandidate(recommendations().t1[0])
  const oldBasis = useSceneStore.getState().recommendationPlayers
  const s = useSceneStore.getState()
  switch (change) {
    case 'setter': s.setPlayerPos(s.setterId, { x: 1.3, z: 2.4 }); break
    case 'attacker': s.setPlayerPos(s.attackerId, { x: 5.8, z: 8 }); break
    case 'distance': s.setApproachDist(3.5); break
    // 改另一名队员的号位，交换到当前攻手时同样使推荐失效。
    case 'zone': s.setPlayerZone('p4', s.players.find(p => p.id === s.attackerId)!.rotationZone); break
    case 'reset': s.resetFormation(); break
    case 'import': expect(importScene(exportScene())).toBeNull(); break
  }
  const after = useSceneStore.getState()
  expect(after.selectedCandidateId).toBeNull()
  expect(after.recommendationPlayers).not.toBe(oldBasis)
  expect(after.recommendationPlayers).toEqual(after.players)
})

it.each(['setter', 'attacker'] as const)('切换 %s 后以当前场上队员重新推荐，不保留旧高亮', change => {
  useSceneStore.getState().applyCandidate(recommendations().t2[0])
  const s = useSceneStore.getState()
  if (change === 'setter') s.setSetter('p3')
  else s.setAttacker('p3')
  const after = useSceneStore.getState()
  expect(after.selectedCandidateId).toBeNull()
  expect(after.selectedStyle).toBeNull()
  expect(after.recommendationPlayers).toEqual(after.players)
  expect(recommendations()).not.toEqual(generateRoutes(initial.players[0], initial.players[1]))
})

it('非参与队员、主题和画质的调整不会重新锚定已套用方案的攻手', () => {
  const before = recommendations()
  useSceneStore.getState().applyCandidate(before.neg[0])
  const s = useSceneStore.getState()
  s.setPlayerPos('p3', { x: 4, z: 4 })
  s.setPlayerZone('p3', 1)
  s.setTheme('blue')
  s.setQuality('fast')
  expect(recommendations()).toEqual(before)
  expect(useSceneStore.getState().selectedCandidateId).toBe(before.neg[0].id)
})

it('修改参数后清除旧方案高亮，风格仍供当前动作质量检查使用', () => {
  const c = recommendations().t1[0]
  useSceneStore.getState().applyCandidate(c)
  useSceneStore.getState().setParams({ apexH: c.params.apexH + 0.2 })
  expect(useSceneStore.getState().selectedCandidateId).toBeNull()
  expect(useSceneStore.getState().selectedStyle).toBe(c.styleId)
})

it('点击已选中的参数值不会误清除方案高亮', () => {
  const c = recommendations().t1[0]
  useSceneStore.getState().applyCandidate(c)
  const s = useSceneStore.getState()
  s.setParams({ mode: 'apex', apexH: c.params.apexH })
  s.setTarget({ ...c.params.target })
  s.setPlayerPos(s.attackerId, { ...c.stand })
  s.setPlayerZone(s.attackerId, s.players.find(p => p.id === s.attackerId)!.rotationZone)
  expect(useSceneStore.getState().selectedCandidateId).toBe(c.id)
})

it('套用方案时恢复其出手高度，使实际轨迹与卡片飞行时间和球速一致', () => {
  useSceneStore.getState().setParams({ releaseH: 2.6 })
  for (const list of Object.values(recommendations())) for (const c of list) {
    useSceneStore.getState().applyCandidate(c)
    const s = useSceneStore.getState()
    const setter = s.players.find(p => p.id === s.setterId)!
    const result = solveByApex(setterRelease(setter.pos, s.params.target, s.params.releaseH, s.params.setDirection),
      { ...s.params.target, y: s.params.contactH }, s.params.apexH)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.traj.flightT).toBeCloseTo(c.metrics.flightT, 10)
      expect(result.traj.speed).toBeCloseTo(c.metrics.speed, 10)
    }
  }
})

it('推荐快照不写入场景存档，导入后按恢复的站位建立新推荐', () => {
  useSceneStore.getState().applyCandidate(recommendations().neg[0])
  const json = exportScene()
  expect(JSON.parse(json)).not.toHaveProperty('recommendationPlayers')
  expect(importScene(json)).toBeNull()
  expect(useSceneStore.getState().recommendationPlayers).toEqual(useSceneStore.getState().players)
})
