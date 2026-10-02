import type { ApproachSteps, Vec2, ZoneId } from '../types'
import { isBackRow } from './court'
import { BALL_RADIUS, handPoint, PALM_PAD, RIG, rotateY } from './rig'
import { ATTACK_POSES } from './attackPoses'
export const ATTACK_YAW = -Math.PI / 2
export const AIR_SPEED = { front: 1.3, back: 2.2 } as const
const G = 9.81
const LAND_BRAKE_T = 0.2
export const footSequence = (steps: ApproachSteps): ('L' | 'R')[] => steps === 2 ? ['R', 'L'] : steps === 3 ? ['L', 'R', 'L'] : ['R', 'L', 'R', 'L']
export const footSequenceLabel = (steps: ApproachSteps): string => footSequence(steps).map(f => f === 'L' ? '左' : '右').join('—')
// 起动、加速、最后两步制动；时间比例为排练模型参数。
export const stepEnds = (steps: ApproachSteps): number[] => steps === 2 ? [0.62, 0.86] : steps === 3 ? [0.27, 0.68, 0.87] : [0.18, 0.42, 0.72, 0.88]
export function groundMove(u: number, distance: number, duration: number, endSpeed: number): number {
  return distance * (3 * u * u - 2 * u ** 3) + duration * endSpeed * (u ** 3 - u * u)
}
export function groundPeakSpeed(distance: number, duration: number, endSpeed: number): number {
  const a = -6 * distance / duration + 3 * endSpeed
  const b = 6 * distance / duration - 2 * endSpeed
  if (Math.abs(a) < 1e-9) return Math.max(0, endSpeed)
  const u = Math.max(0, Math.min(1, -b / (2 * a)))
  return Math.max(endSpeed, a * u * u + b * u, 0)
}

export interface AttackerPlan {
  footfalls: Footfall[]
  initialFeet: Record<'L' | 'R', Vec2>
  events: { load: number; cock: number; accelerate: number; contact: number }
  stand: Vec2
  contactRoot: Vec2
  takeoffRoot: Vec2
  landingRoot: Vec2
  airVelocity: Vec2
  airSpeed: number
  runYaw: number
  distance: number
  startT: number
  takeoffT: number
  contactT: number
  riseT: number
  fallT: number
  landingT: number
  brakeT: number
  jumpH: number
  launchY: number
  steps: ApproachSteps
  runT: number
  requiredRunT: number
  peakSpeed: number
  timingDelta: number
  takeoffFootX: number
}

export interface Footfall {
  side: 'L' | 'R'
  position: Vec2
  yaw: number
  liftT: number
  plantT: number
  releaseT: number
}

export function planAttacker(stand: Vec2, target: Vec2, contactH: number, flightT: number, steps: ApproachSteps = 3, rotationZone: ZoneId = 4, hold = 0.6): AttackerPlan {
  const hand = handPoint(ATTACK_POSES.contact, 'R', PALM_PAD)
  // 球在右手掌面前方，实际掌垫与球面接触；偏移沿击球朝向，而非助跑方向。
  hand.z += BALL_RADIUS
  const hitHand = rotateY(hand, ATTACK_YAW)
  const contactRoot = { x: target.x - hitHand.x, z: target.z - hitHand.z }
  const dx = contactRoot.x - stand.x
  const dz = contactRoot.z - stand.z
  const toContact = Math.hypot(dx, dz)
  const dir = toContact > 1e-6 ? { x: dx / toContact, z: dz / toContact } : { x: -1, z: 0 }
  const launchY = -0.012
  const jumpH = Math.max(0, contactH - hand.y - launchY)
  const contactT = hold + flightT
  // 击球在跳跃顶点；上升、下降使用相同重力，腾空时间由跳高决定。
  const riseT = Math.max(0.02, Math.sqrt(2 * jumpH / G))
  const fallT = riseT
  const takeoffT = contactT - riseT
  const landingT = contactT + fallT
  const brakeT = LAND_BRAKE_T
  // 极短助跑减少离地速度，留出最后一步；贴网球在离地前控制漂移量，
  // 不在空中强行停住或改变方向。预留落地后制动距离，根节点留在网前 0.25m 外。
  const nominalSpeed = isBackRow(rotationZone) ? AIR_SPEED.back : AIR_SPEED.front
  const netSpeedLimit = dir.x < -1e-6
    ? Math.max(0, contactRoot.x - 0.25) / (-dir.x * (fallT + brakeT / 2))
    : Infinity
  const airSpeed = Math.min(nominalSpeed, toContact / (riseT + Math.max(0.18, { 2: 0.32, 3: 0.5, 4: 0.68 }[steps] / 3)), netSpeedLimit)
  const airVelocity = { x: dir.x * airSpeed, z: dir.z * airSpeed }
  const takeoffRoot = { x: contactRoot.x - airVelocity.x * riseT, z: contactRoot.z - airVelocity.z * riseT }
  const landingRoot = { x: contactRoot.x + airVelocity.x * fallT, z: contactRoot.z + airVelocity.z * fallT }
  const distance = Math.hypot(takeoffRoot.x - stand.x, takeoffRoot.z - stand.z)
  // 快球可在二传举球期间开始助跑；高球则延后启动，保持最后一步与球同步。
  // 4.5m/s 是建模速度上限，非生理统一标准；步数还要求最少的落脚时间。
  let lo = Math.max(0.18, distance / 4.5)
  let hi = Math.max(lo, 1.5 * distance / 4.5 + 0.2)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (groundPeakSpeed(distance, mid, airSpeed) > 4.5) lo = mid
    else hi = mid
  }
  const requiredRunT = Math.max(hi, { 2: 0.32, 3: 0.5, 4: 0.68 }[steps])
  const startT = Math.max(0, takeoffT - requiredRunT)
  const runT = Math.max(1e-6, takeoffT - startT)
  const peakSpeed = groundPeakSpeed(distance, runT, airSpeed)
  const timingDelta = takeoffT - requiredRunT
  const runYaw = toContact > 1e-6 ? Math.atan2(dx,dz) : ATTACK_YAW
  const offset=(base:Vec2,side:'L'|'R',yaw:number,forward=0):Vec2=>{
    const p=rotateY({x:(side==='L'?1:-1)*RIG.hipX,y:0,z:forward},yaw)
    return {x:base.x+p.x,z:base.z+p.z}
  }
  const initialFeet={L:offset(stand,'L',runYaw),R:offset(stand,'R',runYaw)}
  const ends=stepEnds(steps),sequence=footSequence(steps)
  const footfalls:Footfall[]=sequence.map((side,i)=>{
    const plant=ends[i], previous=i?ends[i-1]:0
    const d=groundMove(plant,distance,runT,airSpeed)
    const base={x:stand.x+dir.x*d,z:stand.z+dir.z*d}
    const final=i>=steps-2
    const yaw=final ? ATTACK_YAW+ATTACK_POSES.takeoff.pelvisYaw : runYaw
    // Final pair straddles the actual launch root; earlier plants lead the moving COM.
    const position=final ? offset(takeoffRoot,side,yaw,side==='L'?0.045:-0.025)
      : offset(base,side,yaw,Math.min(0.18,distance/(steps*3)))
    const liftT=startT+runT*(i===0?0:previous-0.22)
    return {side,position,yaw,liftT:Math.max(startT,liftT),plantT:startT+plant*runT,releaseT:takeoffT}
  })
  // Release the trailing foot before the COM outruns a fixed-length leg.
  footfalls.forEach((f,i)=>{
    const previous=footfalls.slice(0,i).filter(n=>n.side===f.side).at(-1)
    const anchor=previous?.position ?? initialFeet[f.side]
    const supportTravel=(anchor.x-stand.x)*dir.x+(anchor.z-stand.z)*dir.z+0.30
    let low=0,high=1
    for(let n=0;n<30;n++){const mid=(low+high)/2;if(groundMove(mid,distance,runT,airSpeed)>supportTravel)high=mid;else low=mid}
    f.liftT=Math.max(previous?.plantT ?? startT,Math.min(f.liftT,startT+runT*high))
  })
  footfalls.forEach((f,i)=>{const next=footfalls.slice(i+1).find(n=>n.side===f.side);if(next)f.releaseT=next.liftT})
  const takeoffFootX=Math.min(...footfalls.slice(-2).map(f=>f.position.x+0.045*Math.sin(f.yaw)
    -0.1075*Math.abs(Math.sin(f.yaw))-0.0575*Math.abs(Math.cos(f.yaw))))
  return { stand, contactRoot, takeoffRoot, landingRoot, airVelocity, airSpeed,
    runYaw, footfalls, initialFeet, events:{load:footfalls[steps-2].plantT,cock:takeoffT+riseT*0.56,accelerate:takeoffT+riseT*0.84,contact:contactT},
    distance, steps, runT, requiredRunT, peakSpeed, timingDelta, takeoffFootX, startT, takeoffT, contactT, riseT, fallT, landingT, brakeT, jumpH, launchY }
}

