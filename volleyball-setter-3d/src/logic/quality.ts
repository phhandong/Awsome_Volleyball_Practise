import type { Role, Trajectory, Vec2 } from '../types'
import type { StyleId } from './presets'

/** 传球质量评估（纯函数）：依据教学/规则标准对当前方案做实时体检。 */

export type QualityLevel = 'ok' | 'warn' | 'bad'

export interface QualityItem {
  key: string
  label: string
  /** 实测值文案 */
  value: string
  /** 标准区间/依据文案 */
  band: string
  level: QualityLevel
  /** 一句改进建议 */
  hint: string
}

export interface QualityReport {
  items: QualityItem[]
  /** 综合质量分 0-100 */
  score: number
  level: QualityLevel
  /** 攻手最高击球点（摸高） */
  attackerReach: number
  /** 人球时间差（正=球先到） */
  timingDelta: number
  /** 离网理想区（供地面色带绘制） */
  offNetBand: [number, number]
}

/** 各位置摸高：站立举手 + 扣球弹跳 */
export const ROLE_REACH: Record<Role, { stand: number; jump: number }> = {
  S: { stand: 2.4, jump: 0.65 },
  OH: { stand: 2.45, jump: 0.75 },
  MB: { stand: 2.5, jump: 0.85 },
  OP: { stand: 2.45, jump: 0.75 },
  L: { stand: 2.35, jump: 0.4 },
}

export function attackerReachOf(role: Role): number {
  const r = ROLE_REACH[role]
  return r.stand + r.jump
}

/** 各节奏风格的弧顶标准域 */
export const STYLE_APEX_BAND: Record<StyleId, [number, number]> = {
  t1: [2.55, 2.95],
  t2: [3.0, 3.6],
  t3: [3.5, 4.5],
  neg: [4.4, 5.4],
  back: [2.7, 3.5],
}

/** 各风格允许的"攻手到位后等球"上限（秒） */
const STYLE_MAX_WAIT: Record<StyleId, number> = {
  t1: 0.15,
  t2: 0.4,
  t3: 0.8,
  neg: 1.2,
  back: 0.4,
}

/** 助跑参数：反应 0.25s、跑动 4.5m/s、起跳到击球 0.18s、单步 0.45s */
const REACT = 0.25
const RUN_SPEED = 4.5
const JUMP_PHASE = 0.18
const STEP_TIME = 0.45

export interface QualityContext {
  /** 传球轨迹（solve 成功） */
  pass: Trajectory
  /** 攻手击飞轨迹 */
  attack: Trajectory | null
  /** 攻手（站位即助跑起点） */
  attacker: { pos: Vec2; role: Role }
  /** 二传位置 */
  setterPos: Vec2
  /** 当前选中的风格（未选为 null，用常规标准） */
  styleId: StyleId | null
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function dist2d(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** 离网理想区：负节奏远网 / 后排攻 / 常规前排 */
export function offNetBandOf(styleId: StyleId | null, attackerBackRow: boolean): [number, number] {
  if (styleId === 'neg') return [2.2, 4.6]
  if (attackerBackRow) return [3.3, 7.2]
  return [0.5, 1.2]
}

export function evaluateQuality(ctx: QualityContext): QualityReport {
  const { pass, attack, attacker, setterPos, styleId } = ctx
  const items: QualityItem[] = []
  const contactH = pass.end.y
  const targetX = pass.end.x
  const targetZ = pass.end.z
  const target: Vec2 = { x: targetX, z: targetZ }
  const reach = attackerReachOf(attacker.role)
  const attackerBackRow = attacker.pos.x > 3

  // 0. 规则违例（红色置顶）
  if (attacker.role === 'L') {
    items.push({
      key: 'rule',
      label: '规则',
      value: '自由人进攻',
      band: '自由人不得将高于网的球直接击入对方场区',
      level: 'bad',
      hint: '请更换攻手为其他队员',
    })
  } else if (attackerBackRow && targetX < 3 && contactH > 2.43) {
    items.push({
      key: 'rule',
      label: '规则',
      value: '后排违例风险',
      band: '后排队员前场起跳、击球点整体高于网上沿并击球过网=违例',
      level: 'bad',
      hint: '把击球点移到进攻线后（离网>3m），或改由前排队员进攻',
    })
  } else {
    items.push({
      key: 'rule',
      label: '规则',
      value: '符合规则',
      band: attackerBackRow ? '后排合法进攻（进攻线后起跳）' : '无违例',
      level: 'ok',
      hint: '保持',
    })
  }

  // 1. 离网距离
  const band = offNetBandOf(styleId, attackerBackRow)
  let offNet: QualityItem
  if (targetX >= band[0] && targetX <= band[1]) {
    offNet = {
      key: 'offnet',
      label: '离网距离',
      value: `${targetX.toFixed(2)}m`,
      band: `标准 ${band[0]}–${band[1]}m`,
      level: 'ok',
      hint: '便于攻手完整助跑挥臂',
    }
  } else if (targetX < 0.3 && !attackerBackRow) {
    offNet = {
      key: 'offnet',
      label: '离网距离',
      value: `${targetX.toFixed(2)}m`,
      band: `标准 ${band[0]}–${band[1]}m`,
      level: 'bad',
      hint: '贴网球易被拦/触网，请拉开到 0.5m 外',
    }
  } else if (targetX < band[0]) {
    offNet = {
      key: 'offnet',
      label: '离网距离',
      value: `${targetX.toFixed(2)}m`,
      band: `标准 ${band[0]}–${band[1]}m`,
      level: 'warn',
      hint: '略贴网，留给攻手挥臂的空间不足',
    }
  } else if (targetX > band[1] + 0.8) {
    offNet = {
      key: 'offnet',
      label: '离网距离',
      value: `${targetX.toFixed(2)}m`,
      band: `标准 ${band[0]}–${band[1]}m`,
      level: 'bad',
      hint: '离网过远，攻手难以发力扣球',
    }
  } else {
    offNet = {
      key: 'offnet',
      label: '离网距离',
      value: `${targetX.toFixed(2)}m`,
      band: `标准 ${band[0]}–${band[1]}m`,
      level: 'warn',
      hint: '略偏离标准区，攻手发力稍受限',
    }
  }
  items.push(offNet)

  // 2. 人球节奏：Δ = 飞行时间 - 攻手到位所需时间
  const runDist = dist2d(attacker.pos, target)
  const runTime = runDist / RUN_SPEED
  const needed = REACT + runTime + JUMP_PHASE
  const delta = pass.flightT - needed
  const maxWait = styleId ? STYLE_MAX_WAIT[styleId] : 0.6
  const steps = Math.max(0, Math.min(4, Math.ceil(runTime / STEP_TIME)))
  let timing: QualityItem
  if (delta < 0) {
    timing = {
      key: 'timing',
      label: '人球节奏',
      value: `Δ ${delta.toFixed(2)}s`,
      band: `出手时攻手还差 ${steps} 步助跑`,
      level: 'bad',
      hint: '球到人未到：加快球速、抬高弧顶，或让攻手提前起动',
    }
  } else if (delta > maxWait) {
    timing = {
      key: 'timing',
      label: '人球节奏',
      value: `Δ +${delta.toFixed(2)}s`,
      band: `出手时攻手还差 ${steps} 步助跑`,
      level: 'warn',
      hint: `攻手到位后需等球 ${(delta).toFixed(2)}s，节奏易被对方预判`,
    }
  } else {
    timing = {
      key: 'timing',
      label: '人球节奏',
      value: `Δ +${delta.toFixed(2)}s`,
      band: `出手时攻手还差 ${steps} 步助跑`,
      level: 'ok',
      hint: delta < 0.05 ? '人与球几乎同时到位，节奏吻合' : '攻手可从容起跳',
    }
  }
  items.push(timing)

  // 3. 击球高度 vs 摸高
  let contact: QualityItem
  if (contactH > reach + 0.05) {
    contact = {
      key: 'contact',
      label: '击球高度',
      value: `${contactH.toFixed(2)}m`,
      band: `攻手摸高 ${reach.toFixed(2)}m`,
      level: 'bad',
      hint: '超出攻手最高击球点，只能处理球',
    }
  } else if (contactH >= reach - 0.15) {
    contact = {
      key: 'contact',
      label: '击球高度',
      value: `${contactH.toFixed(2)}m`,
      band: `攻手摸高 ${reach.toFixed(2)}m`,
      level: 'ok',
      hint: '超手窗口，尽量在最高点击球',
    }
  } else if (contactH < 2.3) {
    contact = {
      key: 'contact',
      label: '击球高度',
      value: `${contactH.toFixed(2)}m`,
      band: `攻手摸高 ${reach.toFixed(2)}m`,
      level: 'warn',
      hint: '击球点偏低，过网点易被拦',
    }
  } else if (targetX < 3 && contactH <= 2.53) {
    contact = {
      key: 'contact',
      label: '击球高度',
      value: `${contactH.toFixed(2)}m`,
      band: `攻手摸高 ${reach.toFixed(2)}m`,
      level: 'warn',
      hint: '击球点略高于网上沿，过网角度受限',
    }
  } else {
    contact = {
      key: 'contact',
      label: '击球高度',
      value: `${contactH.toFixed(2)}m`,
      band: `攻手摸高 ${reach.toFixed(2)}m`,
      level: 'ok',
      hint: '高度合适，攻手可充分发力',
    }
  }
  items.push(contact)

  // 4. 弧顶与节奏匹配
  const apexBand: [number, number] = styleId ? STYLE_APEX_BAND[styleId] : [2.6, 4.6]
  const apexLabel = styleId
    ? `${{ t1: '一', t2: '二', t3: '三', neg: '负', back: '背传' }[styleId]}节奏标准 ${apexBand[0]}–${apexBand[1]}m`
    : `常规 ${apexBand[0]}–${apexBand[1]}m`
  items.push(
    pass.apexY < apexBand[0] || pass.apexY > apexBand[1]
      ? {
          key: 'apex',
          label: '弧顶高度',
          value: `${pass.apexY.toFixed(2)}m`,
          band: apexLabel,
          level: 'warn',
          hint: '弧顶与所选节奏特征不符，攻手起跳时机难对上',
        }
      : {
          key: 'apex',
          label: '弧顶高度',
          value: `${pass.apexY.toFixed(2)}m`,
          band: apexLabel,
          level: 'ok',
          hint: '弧线符合节奏特征',
        },
  )

  // 5. 击飞过网余量
  if (attack && attack.netClearance !== null) {
    const c = attack.netClearance
    items.push(
      c >= 0.25
        ? { key: 'clearance', label: '击飞过网余量', value: `+${c.toFixed(2)}m`, band: '≥0.25m 充分', level: 'ok', hint: '击球线路安全' }
        : c >= 0.12
          ? { key: 'clearance', label: '击飞过网余量', value: `+${c.toFixed(2)}m`, band: '0.12–0.25m 贴网', level: 'warn', hint: '线路贴网，易被拦回' }
          : { key: 'clearance', label: '击飞过网余量', value: `+${c.toFixed(2)}m`, band: '<0.12m', level: 'bad', hint: '触网风险，请提高击球高度或放慢球速' },
    )
  }

  // 6. 出手高度
  const releaseH = pass.start.y
  if (releaseH < 2.05) {
    items.push({
      key: 'release',
      label: '出手高度',
      value: `${releaseH.toFixed(2)}m`,
      band: '2.05–2.50m（额前上方）',
      level: 'warn',
      hint: '出手点偏低，建议在额前上方约 2.2m 处出手',
    })
  } else if (releaseH > 2.6) {
    items.push({
      key: 'release',
      label: '出手高度',
      value: `${releaseH.toFixed(2)}m`,
      band: '2.05–2.50m（额前上方）',
      level: 'warn',
      hint: '跳传出手，对手型与稳定性要求高',
    })
  } else {
    items.push({
      key: 'release',
      label: '出手高度',
      value: `${releaseH.toFixed(2)}m`,
      band: '2.05–2.50m（额前上方）',
      level: 'ok',
      hint: '额前上方出手，视线可全程盯球',
    })
  }

  // 7. 二传—目标距离
  const setterDist = dist2d(setterPos, target)
  items.push(
    setterDist < 0.8
      ? { key: 'span', label: '二传—目标距离', value: `${setterDist.toFixed(2)}m`, band: '0.8–7m', level: 'warn', hint: '距离过近，分球空间与隐蔽性不足' }
      : setterDist > 7
        ? { key: 'span', label: '二传—目标距离', value: `${setterDist.toFixed(2)}m`, band: '0.8–7m', level: 'warn', hint: '长距离调整传球，精度风险高' }
        : { key: 'span', label: '二传—目标距离', value: `${setterDist.toFixed(2)}m`, band: '0.8–7m', level: 'ok', hint: '距离合理' },
  )

  // 综合评分
  let score = 100
  for (const it of items) {
    if (it.level === 'bad') score -= it.key === 'rule' ? 35 : 25
    else if (it.level === 'warn') score -= 10
  }
  score = clamp(score, 0, 100)
  const level: QualityLevel = items.some((i) => i.level === 'bad')
    ? 'bad'
    : items.some((i) => i.level === 'warn')
      ? 'warn'
      : 'ok'

  return { items, score, level, attackerReach: reach, timingDelta: delta, offNetBand: band }
}
