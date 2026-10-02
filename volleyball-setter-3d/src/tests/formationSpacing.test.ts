import { afterEach, expect, it } from 'vitest'
import { APPROACH_CLEARANCE, approachLane, clearApproachLane, distanceToSegment } from '../logic/formationSpacing'
import { DEFAULT_FORMATION } from '../logic/court'
import { generateRoutes, STYLES } from '../logic/presets'
import { DEFAULT_PARAMS, exportScene, importScene, useSceneStore } from '../store/sceneStore'

const initial = useSceneStore.getState()
afterEach(() => useSceneStore.setState(initial))

function assertClear() {
  const s = useSceneStore.getState()
  const lane = approachLane(s.players, s.setterId, s.attackerId, s.params)!
  for (const p of s.players.filter(p => p.id !== s.setterId && p.id !== s.attackerId)) {
    expect(distanceToSegment(p.pos, lane.start, lane.end)).toBeGreaterThanOrEqual(APPROACH_CLEARANCE - 1e-8)
  }
}

it.each(STYLES)('$name 各方案让队友避开助跑及落地全路线，不改变攻手、二传与推荐依据', style => {
  const candidates = generateRoutes(initial.players[0], initial.players[1])[style.id]
  for (const candidate of candidates) {
    useSceneStore.setState(initial)
    initial.applyCandidate(candidate)
    const first = useSceneStore.getState()
    const lane = approachLane(first.players, first.setterId, first.attackerId, first.params)!
    const players = first.players.map((p, i) => i > 1 ? { ...p, pos: {
      x: lane.start.x + (lane.end.x - lane.start.x) * (i - 2) / 3,
      z: lane.start.z + (lane.end.z - lane.start.z) * (i - 2) / 3,
    } } : p)
    useSceneStore.setState({ players })
    first.applyCandidate(candidate)
    assertClear()
    const after = useSceneStore.getState()
    expect(after.params).toMatchObject(candidate.params)
    expect(after.players[0]).toBe(players[0])
    expect(after.players[1].pos).toEqual(first.players[1].pos)
    expect(after.players.map(p => [p.id, p.role, p.rotationZone])).toEqual(players.map(p => [p.id, p.role, p.rotationZone]))
    for (const p of after.players.slice(2)) {
      expect(p.pos.x).toBeGreaterThanOrEqual(0.35)
      expect(p.pos.x).toBeLessThanOrEqual(8.65)
      expect(p.pos.z).toBeGreaterThanOrEqual(0.35)
      expect(p.pos.z).toBeLessThanOrEqual(8.65)
      for (const other of after.players.filter(q => q.id !== p.id)) {
        expect(Math.hypot(p.pos.x - other.pos.x, p.pos.z - other.pos.z)).toBeGreaterThanOrEqual(APPROACH_CLEARANCE)
      }
    }
    expect(after.recommendationPlayers).toBe(initial.recommendationPlayers)
    const arranged = after.players
    after.applyCandidate(candidate)
    expect(useSceneStore.getState().players.slice(2)).toEqual(arranged.slice(2))
  }
})

it('不挡路的队友与无变化的阵型保持原引用', () => {
  expect(clearApproachLane(DEFAULT_FORMATION, 'p1', 'p2', DEFAULT_PARAMS)).toBe(DEFAULT_FORMATION)
})

it('手动拖动队友进助跑路线时，就近让出通道', () => {
  const lane = approachLane(initial.players, initial.setterId, initial.attackerId, initial.params)!
  initial.setPlayerPos('p3', { x: (lane.start.x + lane.end.x) / 2, z: (lane.start.z + lane.end.z) / 2 })
  assertClear()
  expect(useSceneStore.getState().selectedCandidateId).toBeNull()
})

it.each(['target', 'params', 'attacker', 'distance', 'setter'] as const)('手动修改 %s 时重新留出通道', action => {
  const players = initial.players.map((p, i) => i > 1 ? { ...p, pos: initial.players[1].pos } : p)
  useSceneStore.setState({ players })
  const s = useSceneStore.getState()
  if (action === 'target') s.setTarget({ x: 1.2, z: 6.8 })
  if (action === 'params') s.setParams({ approachSteps: 4 })
  if (action === 'attacker') s.setAttacker('p3')
  if (action === 'distance') s.setApproachDist(3.3)
  if (action === 'setter') s.setSetter('p4')
  assertClear()
})

it('导入旧局面也清理通道，并将调整后的站位正常存档', () => {
  const lane = approachLane(initial.players, initial.setterId, initial.attackerId, initial.params)!
  const players = initial.players.map(p => p.id === 'p3' ? { ...p, pos: lane.end } : p)
  expect(importScene(JSON.stringify({ players, setterId: 'p1', attackerId: 'p2', params: initial.params }))).toBeNull()
  assertClear()
  expect(JSON.parse(exportScene()).players).toEqual(useSceneStore.getState().players)
})

it('退化路线也按起点圆形区域计算间距', () => {
  expect(distanceToSegment({ x: 1, z: 2 }, { x: 1, z: 1 }, { x: 1, z: 1 })).toBe(1)
})
