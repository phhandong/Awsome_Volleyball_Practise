import { create } from 'zustand'
import type { CourtTheme, PlayerState, Quality, RouteParams, Vec2, ZoneId } from '../types'
import type { RouteCandidate, StyleId } from '../logic/presets'
import { DEFAULT_FORMATION } from '../logic/court'
import { clearApproachLane } from '../logic/formationSpacing'

interface SceneState {
  players: PlayerState[]
  /** 本次推荐的站位依据；套用方案的自动站位不反向改写推荐。仅运行时使用。 */
  recommendationPlayers: PlayerState[]
  setterId: string
  attackerId: string
  params: RouteParams
  selectedCandidateId: string | null
  /** 当前选中的风格（用于质量检查的风格化标准） */
  selectedStyle: StyleId | null
  quality: Quality
  theme: CourtTheme
  showZones: boolean
  /** 攻手助跑距离（米，攻手站位到击球点） */
  approachDist: number

  setParams: (partial: Partial<RouteParams>) => void
  setTarget: (pos: Vec2) => void
  setPlayerPos: (id: string, pos: Vec2) => void
  setPlayerZone: (id: string, zone: ZoneId) => void
  setSetter: (id: string) => void
  setAttacker: (id: string) => void
  applyCandidate: (c: RouteCandidate) => void
  clearCandidate: () => void
  resetFormation: () => void
  setQuality: (q: Quality) => void
  setTheme: (t: CourtTheme) => void
  setShowZones: (v: boolean) => void
  setApproachDist: (d: number) => void
}

export const DEFAULT_PARAMS: RouteParams = {
  setDirection: 'front',
  approachSteps: 3,
  mode: 'apex',
  apexH: 3.4,
  flightT: 0.85,
  speed: 8.5,
  arc: 'high',
  target: { x: 0.95, z: 7.0 },
  contactH: 2.85,
  releaseH: 2.2,
}

function clampTarget(p: { x: number; z: number }): { x: number; z: number } {
  return {
    x: Math.max(0.25, Math.min(8.75, p.x)),
    z: Math.max(0.25, Math.min(8.75, p.z)),
  }
}

function recommendationBasis(s: SceneState, players: PlayerState[], changedIds: string[]): PlayerState[] {
  if (changedIds.includes(s.setterId) || changedIds.includes(s.attackerId)) return players
  return s.recommendationPlayers.map(p => changedIds.includes(p.id) ? players.find(next => next.id === p.id) ?? p : p)
}

function affectsRecommendation(s: SceneState, changedIds: string[]): boolean {
  return changedIds.includes(s.setterId) || changedIds.includes(s.attackerId)
}

export const useSceneStore = create<SceneState>((rawSet) => {
  // 一次状态更新内完成站位避让，场景、面板、存档读取同一阵型。
  const set = (update: Partial<SceneState> | ((s: SceneState) => Partial<SceneState>)) => rawSet(s => {
    const patch = typeof update === 'function' ? update(s) : update
    const next = { ...s, ...patch }
    if (next.players === s.players && next.params === s.params
      && next.setterId === s.setterId && next.attackerId === s.attackerId) return patch
    const players = clearApproachLane(next.players, next.setterId, next.attackerId, next.params)
    if (players === next.players) return patch
    return { ...patch, players,
      ...(patch.recommendationPlayers === next.players ? { recommendationPlayers: players } : {}),
    }
  })
  return ({
  players: DEFAULT_FORMATION.map((f) => ({ ...f, pos: { ...f.pos } })),
  recommendationPlayers: DEFAULT_FORMATION.map((f) => ({ ...f, pos: { ...f.pos } })),
  setterId: 'p1',
  attackerId: 'p2',
  params: { ...DEFAULT_PARAMS, target: { ...DEFAULT_PARAMS.target } },
  selectedCandidateId: null,
  selectedStyle: null,
  quality: 'high',
  theme: 'wood',
  showZones: true,
  approachDist: 2.4,

  setParams: (partial) => set((s) => {
    const changed = Object.entries(partial).some(([key, value]) => key === 'target'
      ? (value as Vec2).x !== s.params.target.x || (value as Vec2).z !== s.params.target.z
      : value !== s.params[key as keyof RouteParams])
    return changed ? { params: { ...s.params, ...partial }, selectedCandidateId: null } : {}
  }),
  setTarget: (pos) =>
    set((s) => pos.x === s.params.target.x && pos.z === s.params.target.z ? {} : ({
      params: { ...s.params, target: pos }, selectedCandidateId: null, selectedStyle: null,
    })),
  setPlayerPos: (id, pos) =>
    set((s) => {
      const prev = s.players.find((p) => p.id === id)
      if (!prev || (prev.pos.x === pos.x && prev.pos.z === pos.z)) return {}
      const players = s.players.map((p) => (p.id === id ? { ...p, pos } : p))
      const recommendationPlayers = recommendationBasis(s, players, [id])
      // 攻手移动时，击球点随攻手平移（保持相对偏移）
      if (prev && id === s.attackerId && (prev.pos.x !== pos.x || prev.pos.z !== pos.z)) {
        const newTarget = clampTarget({
          x: s.params.target.x + (pos.x - prev.pos.x),
          z: s.params.target.z + (pos.z - prev.pos.z),
        })
        return {
          players,
          recommendationPlayers,
          params: {
            ...s.params,
            target: newTarget,
          },
          approachDist: Math.hypot(pos.x - newTarget.x, pos.z - newTarget.z),
          selectedCandidateId: null,
        }
      }
      return { players, recommendationPlayers,
        ...(affectsRecommendation(s, [id]) ? { selectedCandidateId: null } : {}),
      }
    }),
  setPlayerZone: (id, zone) => set((s) => {
    const current = s.players.find(p => p.id === id)
    if (!current || current.rotationZone === zone) return {}
    const changedIds = s.players.filter(p => p.id === id || p.rotationZone === zone).map(p => p.id)
    // 交换号位，保持本轮六人各占一个轮转位置。
    const players = s.players.map(p => p.id === id ? { ...p, rotationZone: zone }
      : p.rotationZone === zone ? { ...p, rotationZone: current.rotationZone } : p)
    return { players, recommendationPlayers: recommendationBasis(s, players, changedIds),
      ...(affectsRecommendation(s, changedIds) ? { selectedCandidateId: null } : {}),
    }
  }),
  setSetter: (id) => set(s => id === s.setterId || !s.players.some(p => p.id === id) ? {} : ({
    setterId: id, recommendationPlayers: s.players, selectedCandidateId: null, selectedStyle: null,
  })),
  setAttacker: (id) =>
    set((s) => {
      if (id === s.attackerId) return { attackerId: id }
      const old = s.players.find((p) => p.id === s.attackerId)
      const next = s.players.find((p) => p.id === id)
      if (!old || !next) return {}
      // 切换攻手时，击球点同样重新锚定到新攻手附近（保持相对偏移）
      return {
        attackerId: id,
        recommendationPlayers: s.players,
        params: {
          ...s.params,
          target: clampTarget({
            x: s.params.target.x + (next.pos.x - old.pos.x),
            z: s.params.target.z + (next.pos.z - old.pos.z),
          }),
        },
        selectedCandidateId: null,
        selectedStyle: null,
      }
    }),
  applyCandidate: (c) =>
    set((s) => ({
      params: {
        ...s.params,
        mode: 'apex',
        setDirection: c.styleId === 'back' || c.variantName.includes('背') ? 'back' : 'front',
        approachSteps: c.styleId === 't1' ? 2 : 3,
        apexH: c.params.apexH,
        target: { ...c.params.target },
        contactH: c.params.contactH,
        releaseH: c.params.releaseH,
      },
      // 攻手随所选球种移动到对应的助跑站位
      players: s.players.map((p) => (p.id === s.attackerId ? { ...p, pos: { ...c.stand } } : p)),
      approachDist: Math.hypot(c.stand.x - c.params.target.x, c.stand.z - c.params.target.z),
      selectedCandidateId: c.id,
      selectedStyle: c.styleId,
    })),
  clearCandidate: () => set({ selectedCandidateId: null, selectedStyle: null }),
  resetFormation: () => {
    const players = DEFAULT_FORMATION.map((f) => ({ ...f, pos: { ...f.pos } }))
    set({
      players,
      recommendationPlayers: players,
      selectedCandidateId: null,
      selectedStyle: null,
    })
  },
  setQuality: (quality) => set({ quality }),
  setTheme: (theme) => set({ theme }),
  setShowZones: (showZones) => set({ showZones }),
  setApproachDist: (d) =>
    set((s) => {
      const atk = s.players.find((p) => p.id === s.attackerId)
      if (!atk) return { approachDist: d }
      const t = s.params.target
      let dx = atk.pos.x - t.x
      let dz = atk.pos.z - t.z
      if (Math.hypot(dx, dz) < 0.05) {
        // 方向退化时，默认从本方后场方向助跑
        dx = 5.5 - t.x
        dz = 4.5 - t.z
      }
      const len = Math.hypot(dx, dz) || 1
      const pos = clampTarget({ x: t.x + (dx / len) * d, z: t.z + (dz / len) * d })
      const players = s.players.map((p) => (p.id === s.attackerId ? { ...p, pos } : p))
      return {
        approachDist: d,
        players,
        recommendationPlayers: players,
        selectedCandidateId: null,
      }
    }),
  })
})

/** 导出当前局面为可序列化 JSON */
export function exportScene(): string {
  const s = useSceneStore.getState()
  return JSON.stringify(
    {
      version: 2,
      players: s.players,
      setterId: s.setterId,
      attackerId: s.attackerId,
      params: s.params,
      theme: s.theme,
    },
    null,
    2,
  )
}

/** 从 JSON 恢复局面；格式非法时返回错误信息，成功返回 null */
export function importScene(json: string): string | null {
  try {
    const data = JSON.parse(json) as {
      version?: number
      players?: PlayerState[]
      setterId?: string
      attackerId?: string
      params?: Partial<RouteParams>
      theme?: CourtTheme
    }
    if (!Array.isArray(data.players) || data.players.length === 0) return '缺少球员数据'
    const players = data.players.map((p, i) => ({ ...p,
      rotationZone: p.rotationZone ?? DEFAULT_FORMATION.find(f => f.id === p.id)?.rotationZone ?? DEFAULT_FORMATION[i % 6].rotationZone,
    }))
    if (players.some(p => ![1, 2, 3, 4, 5, 6].includes(p.rotationZone))
      || new Set(players.map(p => p.rotationZone)).size !== players.length) return '轮转号位必须为 1–6 且不能重复'
    const params = { ...DEFAULT_PARAMS, ...(data.params ?? {}) }
    if (![2, 3, 4].includes(params.approachSteps)) return '助跑步数必须为 2、3 或 4'
    if (!['front', 'back'].includes(params.setDirection)) return '传球方式必须为正传或背传' 
    const setterId = data.setterId ?? players[0].id
    const attackerId = data.attackerId ?? players[0].id
    const arrangedPlayers = clearApproachLane(players, setterId, attackerId, params)
    useSceneStore.setState({
      players: arrangedPlayers,
      recommendationPlayers: arrangedPlayers,
      setterId,
      attackerId,
      params,
      theme: data.theme === 'blue' ? 'blue' : 'wood',
      selectedCandidateId: null,
      selectedStyle: null,
      approachDist: Math.hypot((players.find(p => p.id === data.attackerId) ?? players[0]).pos.x - params.target.x, (players.find(p => p.id === data.attackerId) ?? players[0]).pos.z - params.target.z),
    })
    return null
  } catch {
    return 'JSON 解析失败'
  }
}
