import type { PlayerState, Vec2, ZoneId } from '../types'

export const isBackRow = (zone: ZoneId): boolean => zone === 1 || zone === 5 || zone === 6

/** 标准室内排球场几何常量（米）。网在 x=0，我方半场 x∈[0,9]。 */
export const COURT = {
  /** 全场长（两半场） */
  length: 18,
  /** 网到底线 */
  halfLength: 9,
  /** 边线宽 */
  width: 9,
  /** 网高（男子） */
  netHeight: 2.43,
  /** 进攻线距网 */
  attackLine: 3,
  lineWidth: 0.05,
  /** 无障碍区宽度 */
  apron: 4,
} as const

/**
 * 号位判定。面向网（-x 方向）观察：前排左→右为 4-3-2，后排左→右为 5-6-1。
 * 观察者的右侧是 -z 方向，因此 4 号位在 +z 一侧。
 */
export function zoneOf(x: number, z: number): ZoneId {
  const front = x <= COURT.attackLine
  if (z > 6) return front ? 4 : 5
  if (z < 3) return front ? 2 : 1
  return front ? 3 : 6
}

/** 号位中心点（逻辑坐标） */
export function zoneCenter(zone: ZoneId): Vec2 {
  const frontX = COURT.attackLine / 2
  const backX = (COURT.attackLine + COURT.halfLength) / 2
  const leftZ = 7.5
  const midZ = 4.5
  const rightZ = 1.5
  switch (zone) {
    case 4:
      return { x: frontX, z: leftZ }
    case 3:
      return { x: frontX, z: midZ }
    case 2:
      return { x: frontX, z: rightZ }
    case 5:
      return { x: backX, z: leftZ }
    case 6:
      return { x: backX, z: midZ }
    case 1:
      return { x: backX, z: rightZ }
  }
}

export const ZONE_NAMES: Record<ZoneId, string> = {
  1: '1号位',
  2: '2号位',
  3: '3号位',
  4: '4号位',
  5: '5号位',
  6: '6号位',
}

export const ROLE_NAMES: Record<string, string> = {
  S: '二传',
  OH: '主攻',
  MB: '副攻',
  OP: '接应',
  L: '自由人',
}

/** 默认 5-1 阵型（二传在前排 2 号位插上的轮次快照；主攻站位含助跑距离） */
export const DEFAULT_FORMATION: PlayerState[] = [
  { id: 'p1', rotationZone: 2, number: 10, role: 'S', name: '二传', pos: { x: 0.7, z: 1.6 } },
  { id: 'p2', rotationZone: 4, number: 8, role: 'OH', name: '主攻', pos: { x: 3.3, z: 7.65 } },
  { id: 'p3', rotationZone: 3, number: 6, role: 'MB', name: '副攻', pos: { x: 1.0, z: 4.5 } },
  { id: 'p4', rotationZone: 1, number: 12, role: 'OP', name: '接应', pos: { x: 4.6, z: 1.3 } },
  { id: 'p5', rotationZone: 5, number: 9, role: 'OH', name: '主攻', pos: { x: 4.6, z: 7.6 } },
  { id: 'p6', rotationZone: 6, number: 2, role: 'L', name: '自由人', pos: { x: 6.2, z: 4.5 } },
]
