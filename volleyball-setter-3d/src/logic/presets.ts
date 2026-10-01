import type { PlayerState, SolveResult, Vec2 } from '../types'
import { COURT } from './court'
import { solveByApex } from './trajectory'

export type StyleId = 't1' | 't2' | 't3' | 'neg' | 'back'

export interface StyleDef {
  id: StyleId
  name: string
  short: string
  color: string
  desc: string
}

/** 五种预设风格。负节奏按参考项目惯例取"远网调整高球"。 */
export const STYLES: StyleDef[] = [
  { id: 't1', name: '一节奏', short: '快球', color: '#ffd23f', desc: '低弧快速，攻手与球同起' },
  { id: 't2', name: '二节奏', short: '半高', color: '#4fc3f7', desc: '中等弧度半高球' },
  { id: 't3', name: '三节奏', short: '高球', color: '#ff7043', desc: '高弧拉开，充分助跑' },
  { id: 'neg', name: '负节奏', short: '调整攻', color: '#b39ddb', desc: '远网调整高球' },
  { id: 'back', name: '背传', short: '背后', color: '#66bb6a', desc: '向二传身后组织' },
]

export interface RouteCandidate {
  id: string
  styleId: StyleId
  styleName: string
  variantName: string
  color: string
  score: number
  parts: { offNet: number; reach: number; elevation: number; arc: number }
  params: { target: Vec2; contactH: number; apexH: number }
  /** 选中该方案时攻手的助跑站位 */
  stand: Vec2
  metrics: {
    flightT: number
    speed: number
    elevDeg: number
    apexY: number
    offNetM: number
    netClearance: number | null
  }
}

interface VariantSpec {
  name: string
  target: (setter: Vec2, attacker: Vec2) => Vec2
  contactH: number
  apexH: number
  /** 选中该方案时攻手的助跑站位（相对击球点的偏移，指向本方场地方向） */
  stand: [number, number]
  /** 额外弧顶增量档位（默认只测基础弧顶） */
  apexDeltas?: number[]
}

interface StyleSpec {
  id: StyleId
  apexDeltas: number[]
  variants: VariantSpec[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function inCourt(p: Vec2): Vec2 {
  return { x: clamp(p.x, 0.25, COURT.halfLength - 0.25), z: clamp(p.z, 0.25, COURT.width - 0.25) }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** 由二传指向攻手的单位方向（水平） */
function toward(setter: Vec2, attacker: Vec2): Vec2 {
  const d = dist(setter, attacker)
  if (d < 0.3) return { x: -1, z: 0 }
  return { x: (attacker.x - setter.x) / d, z: (attacker.z - setter.z) / d }
}

const STYLE_SPECS: StyleSpec[] = [
  {
    id: 't1',
    apexDeltas: [0, 0.15],
    variants: [
      { name: 'A快', contactH: 2.62, apexH: 2.78, stand: [1.2, 0.15], target: (s, a) => add(s, mul(toward(s, a), 0.55)) },
      { name: 'B快', contactH: 2.66, apexH: 2.82, stand: [1.2, 0.15], target: (s, a) => add(s, { x: toward(s, a).x * 0.9 - 0.15, z: toward(s, a).z * 0.9 + 0.55 }) },
      { name: '短平快', contactH: 2.6, apexH: 2.72, stand: [0.9, -0.7], target: (s) => ({ x: s.x + 0.35, z: s.z + 1.6 }) },
      { name: '背快', contactH: 2.62, apexH: 2.76, stand: [1.0, 0.7], target: (s) => ({ x: s.x + 0.25, z: s.z - 0.65 }) },
    ],
  },
  {
    id: 't2',
    apexDeltas: [0, 0.3],
    variants: [
      { name: '三号位半高', contactH: 2.8, apexH: 3.3, stand: [1.6, 0.1], target: (s, a) => add(s, mul(toward(s, a), 1.35)) },
      { name: '二号位半高', contactH: 2.78, apexH: 3.28, stand: [1.6, 0.4], target: (s) => ({ x: s.x + 0.3, z: Math.max(0.6, s.z - 1.35) }) },
    ],
  },
  {
    id: 't3',
    apexDeltas: [0, 0.35],
    variants: [
      { name: '四号位拉开', contactH: 2.9, apexH: 4.0, stand: [2.3, 0.25], target: (_s, a) => ({ x: 1.05, z: clamp(a.z, 6.2, 8.3) }) },
      { name: '二号位高球', contactH: 2.88, apexH: 4.0, stand: [2.3, 0.3], target: (s) => ({ x: 1.05, z: clamp(s.z - 1.2, 0.7, 2.6) }) },
      { name: '后排一号位', contactH: 3.0, apexH: 4.35, stand: [1.5, 0.3], target: (_s, a) => ({ x: clamp(Math.max(a.x, 3.6), 3.6, 6.5), z: clamp(a.z, 0.5, 2.8) }) },
      { name: '后排六号位', contactH: 3.0, apexH: 4.35, stand: [1.5, 0.1], target: (_s, a) => ({ x: clamp(Math.max(a.x, 3.8), 3.8, 6.8), z: clamp(a.z, 3.4, 5.6) }) },
    ],
  },
  {
    id: 'neg',
    apexDeltas: [0, 0.4],
    variants: [
      { name: '远网调整', contactH: 3.0, apexH: 4.8, stand: [1.7, 0.3], target: (_s, a) => ({ x: clamp(a.x, 2.2, 4.6), z: clamp(a.z, 0.6, 8.4) }) },
      { name: '超高调整', contactH: 3.0, apexH: 5.2, stand: [1.7, 0.3], target: (_s, a) => ({ x: clamp(a.x, 2.2, 4.6), z: clamp(a.z, 0.6, 8.4) }) },
    ],
  },
  {
    id: 'back',
    apexDeltas: [0, 0.25],
    variants: [
      { name: '背二', contactH: 2.75, apexH: 3.2, stand: [1.1, 0.9], target: (s) => ({ x: s.x + 0.5, z: Math.max(0.5, s.z - 1.0) }) },
      { name: '背飞', contactH: 2.9, apexH: 3.45, stand: [1.4, 1.2], target: (s) => ({ x: s.x + 0.9, z: Math.max(0.5, s.z - 2.1) }) },
      { name: '背平', contactH: 2.62, apexH: 2.85, stand: [0.9, 0.8], target: (s) => ({ x: s.x + 0.2, z: Math.max(0.5, s.z - 1.45) }) },
    ],
  },
]

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z }
}

function mul(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, z: v.z * k }
}

/** 区间打分：[lo,hi] 内满分，向两端线性衰减至 min/max 处为 0 */
function bandScore(v: number, lo: number, hi: number, min: number, max: number): number {
  if (v >= lo && v <= hi) return 1
  if (v < lo) return clamp((v - min) / (lo - min), 0, 1)
  return clamp((max - v) / (max - hi), 0, 1)
}

function scoreCandidate(
  cand: Omit<RouteCandidate, 'score' | 'parts'>,
  attackerPos: Vec2,
): { score: number; parts: RouteCandidate['parts'] } | null {
  const m = cand.metrics
  if (m.netClearance !== null && m.netClearance < 0.05) return null // 过不了网

  const offNet = cand.params.target.x
  const isBackRow = offNet > COURT.attackLine
  const p1 = isBackRow ? bandScore(offNet, 3.3, 7.2, 3.05, 8.9) : bandScore(offNet, 0.5, 1.2, 0.2, 2.8)

  const needed = dist(attackerPos, cand.params.target) / 4.5 + 0.25
  const p2 = needed <= 0.85 * m.flightT ? 1 : Math.max(0, 1 - (needed - 0.85 * m.flightT) * 1.5)

  const p3 = bandScore(m.elevDeg, 22, 58, 6, 78)

  let p4 = bandScore(m.apexY, 2.6, 5.2, 2.5, 5.6)
  if (m.netClearance !== null) {
    p4 = Math.min(p4, clamp(m.netClearance / 0.2, 0, 1))
  }

  return { score: Math.round(100 * (0.3 * p1 + 0.3 * p2 + 0.2 * p3 + 0.2 * p4)), parts: { offNet: p1, reach: p2, elevation: p3, arc: p4 } }
}

/**
 * 生成五种风格的推荐传球路线：每风格基于当前二传/攻手位置展开变体与弧顶档位，
 * 逐个求解打分，返回每风格得分最高的前 3 个（分数降序）。
 */
export function generateRoutes(setter: PlayerState, attacker: PlayerState): Record<StyleId, RouteCandidate[]> {
  const result = {} as Record<StyleId, RouteCandidate[]>
  for (const spec of STYLE_SPECS) {
    const style = STYLES.find((s) => s.id === spec.id)!
    const candidates: RouteCandidate[] = []
    const deltas = spec.apexDeltas
    for (const variant of spec.variants) {
      const base = inCourt(variant.target(setter.pos, attacker.pos))
      // 出手点同样取额前上方（朝该球目标方向前移 0.16m）
      const sdx = base.x - setter.pos.x
      const sdz = base.z - setter.pos.z
      const sd = Math.hypot(sdx, sdz) || 1
      const start = {
        x: setter.pos.x + (sdx / sd) * 0.16,
        y: 2.2,
        z: setter.pos.z + (sdz / sd) * 0.16,
      }
      for (const d of deltas) {
        const target = base
        const apexH = variant.apexH + d
        const stand = inCourt(add(base, { x: variant.stand[0], z: variant.stand[1] }))
        const solve: SolveResult = solveByApex(
          start,
          { x: target.x, y: variant.contactH, z: target.z },
          apexH,
        )
        if (solve.status !== 'ok') continue
        const t = solve.traj
        const partial = {
          id: `${spec.id}-${variant.name}-${d}`,
          styleId: spec.id,
          styleName: style.name,
          variantName: variant.name,
          color: style.color,
          params: { target, contactH: variant.contactH, apexH },
          stand,
          metrics: {
            flightT: t.flightT,
            speed: t.speed,
            elevDeg: t.elevDeg,
            apexY: t.apexY,
            offNetM: target.x,
            netClearance: t.netClearance,
          },
        }
        const scored = scoreCandidate(partial, attacker.pos)
        if (!scored) continue
        candidates.push({ ...partial, score: scored.score, parts: scored.parts })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    result[spec.id] = candidates.slice(0, 3)
  }
  return result
}
