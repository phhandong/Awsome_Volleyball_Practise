/** 静止空气中的球：二次阻力，不模拟旋转、风或飘球。
 * 质量/半径取 FIVB 规则范围中值；Cd 是简化的有效系数，不是特定球型的实测常数。
 */
export const BALL_PHYSICS = Object.freeze({
  gravity: 9.81,
  mass: 0.27,
  radius: 0.105,
  airDensity: 1.2,
  dragCoefficient: 0.4,
})

export const BALL_DRAG = 0.5 * BALL_PHYSICS.airDensity * BALL_PHYSICS.dragCoefficient
  * Math.PI * BALL_PHYSICS.radius ** 2 / BALL_PHYSICS.mass

export interface FlightState {
  d: number
  y: number
  vh: number
  vy: number
}

function derivative(s: FlightState, drag: number): FlightState {
  const resistance = drag * Math.hypot(s.vh, s.vy)
  return { d: s.vh, y: s.vy, vh: -resistance * s.vh, vy: -BALL_PHYSICS.gravity - resistance * s.vy }
}

function offset(s: FlightState, k: FlightState, h: number): FlightState {
  return { d: s.d + k.d * h, y: s.y + k.y * h, vh: s.vh + k.vh * h, vy: s.vy + k.vy * h }
}

/** 四阶积分；同一飞行时间内每步等长，供轨迹按时间采样。 */
export function stepBall(s: FlightState, dt: number, drag = BALL_DRAG): FlightState {
  const a = derivative(s, drag)
  const b = derivative(offset(s, a, dt / 2), drag)
  const c = derivative(offset(s, b, dt / 2), drag)
  const e = derivative(offset(s, c, dt), drag)
  const h = dt / 6
  return {
    d: s.d + h * (a.d + 2 * b.d + 2 * c.d + e.d),
    y: s.y + h * (a.y + 2 * b.y + 2 * c.y + e.y),
    vh: s.vh + h * (a.vh + 2 * b.vh + 2 * c.vh + e.vh),
    vy: s.vy + h * (a.vy + 2 * b.vy + 2 * c.vy + e.vy),
  }
}

export function hermite(a: number, b: number, va: number, vb: number, dt: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * dt * va
    + (-2 * u3 + 3 * u2) * b + (u3 - u2) * dt * vb
}

export function integrateBall(vh: number, vy: number, time: number, samples = false, drag = BALL_DRAG) {
  // 限制单步阻力变化，防止高速数值发散；普通排练每步不超过 10ms。
  const count = Math.max(1, Math.ceil(time / Math.min(0.01, 0.15 / Math.max(1, drag * Math.hypot(vh, vy)))))
  const dt = time / count
  let state: FlightState = { d: 0, y: 0, vh, vy }
  let apex = 0
  const states = samples ? [state] : []
  for (let i = 0; i < count; i++) {
    const next = stepBall(state, dt, drag)
    if (state.vy > 0 && next.vy <= 0) {
      const u = state.vy / (state.vy - next.vy)
      apex = Math.max(apex, hermite(state.y, next.y, state.vy, next.vy, dt, u))
    }
    apex = Math.max(apex, next.y)
    state = next
    if (samples) states.push(state)
  }
  return { state, apex, states }
}
