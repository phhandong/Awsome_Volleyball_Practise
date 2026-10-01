/** 全局共享类型。逻辑坐标（米）：网在 x=0，我方半场 x∈[0,9]（x=9 为我方底线），z∈[0,9]，y 向上。 */

export type ZoneId = 1 | 2 | 3 | 4 | 5 | 6

export type Role = 'S' | 'OH' | 'MB' | 'OP' | 'L'

export interface Vec2 {
  x: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface PlayerState {
  id: string
  number: number
  role: Role
  name: string
  /** 本轮所属号位，移动及助跑不改变前后排身份 */
  rotationZone: ZoneId
  /** 场上逻辑坐标（地面投影） */
  pos: Vec2
}

export type EditMode = 'apex' | 'time' | 'speed'
export type ArcChoice = 'low' | 'high'
export type Quality = 'high' | 'fast'
export type CourtTheme = 'blue' | 'wood'
export type SetDirection = 'front' | 'back'
export type ApproachSteps = 2 | 3 | 4

/** 路线编辑参数（store 中持久保存的部分） */
export interface RouteParams {
  setDirection: SetDirection
  /** 当前右手扣球模型的明确步数 */
  approachSteps: ApproachSteps
  mode: EditMode
  /** 弧顶绝对高度（米），mode === 'apex' */
  apexH: number
  /** 飞行时间（秒），mode === 'time' */
  flightT: number
  /** 出手初速度 m/s，mode === 'speed' */
  speed: number
  /** mode === 'speed' 时选低弧/高弧 */
  arc: ArcChoice
  /** 目标击球点地面位置 */
  target: Vec2
  /** 击球高度（米） */
  contactH: number
  /** 二传出手高度（米） */
  releaseH: number
}

export interface Trajectory {
  start: Vec3
  end: Vec3
  /** 曲线采样点（含首尾） */
  points: Vec3[]
  /** 飞行时间 s */
  flightT: number
  /** 出手初速度 m/s */
  speed: number
  /** 水平速度分量 m/s */
  horizontalV: number
  /** 竖直初速度 m/s（向上为正） */
  verticalV0: number
  /** 出手仰角（度） */
  elevDeg: number
  /** 水平方向角（度），0° = 正朝网（-x 方向），180° = 背网 */
  dirDeg: number
  /** 弧顶绝对高度 */
  apexY: number
  /** 水平位移（米） */
  span: number
  /** 球穿过网面处高于网带的余量；轨迹不穿网为 null */
  netClearance: number | null
}

export type SolveResult =
  | { status: 'ok'; traj: Trajectory }
  | { status: 'error'; message: string }
