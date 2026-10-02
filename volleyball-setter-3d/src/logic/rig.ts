import type { Vec3 } from '../types'
import type { Pose } from '../features/setplay/scene/poses'

export const RIG = { hipY: 0.94, torsoY: 0.08, shoulderX: 0.185, shoulderY: 0.42,
  // Slightly elongated athletic proportions keep the setter's hands clear of
  // the face and give the hitter a readable full arm swing.
  upperArm: 0.30, forearm: 0.26, handRadius: 0.05,
  hipX: 0.095, legOriginY: -0.02, thigh: 0.44, shin: 0.40, ankleHeight: 0.078,
  headY: 0.645, eyeY: 0.002, eyeZ: 0.098 } as const
export const BALL_RADIUS = 0.105
export type Side = 'L' | 'R'
export const add = (a: Vec3, b: Vec3): Vec3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
export const sub = (a: Vec3, b: Vec3): Vec3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
export const scale = (v: Vec3, k: number): Vec3 => ({x:v.x*k,y:v.y*k,z:v.z*k})
export const dot = (a: Vec3,b: Vec3) => a.x*b.x+a.y*b.y+a.z*b.z
export const cross = (a: Vec3,b: Vec3): Vec3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
export const length = (v: Vec3) => Math.hypot(v.x,v.y,v.z)
export const unit = (v: Vec3) => scale(v,1/Math.max(1e-9,length(v)))
const clamp = (v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))
export function rotateX(p: Vec3,a:number): Vec3 { return {x:p.x,y:p.y*Math.cos(a)-p.z*Math.sin(a),z:p.y*Math.sin(a)+p.z*Math.cos(a)} }
export function rotateY(p: Vec3,a:number): Vec3 { return {x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)} }
export function rotateZ(p: Vec3,a:number): Vec3 { return {x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a),z:p.z} }
// Three Euler XYZ is R_x R_y R_z, applied right to left.
export function rotate(p:Vec3,e:Vec3) { return rotateX(rotateY(rotateZ(p,e.z),e.y),e.x) }
export function unrotate(p:Vec3,e:Vec3) { return rotateZ(rotateY(rotateX(p,-e.x),-e.y),-e.z) }
export function eulerFromBasis(x:Vec3,y:Vec3,z:Vec3):Vec3 {
  const ey=Math.asin(clamp(z.x,-1,1))
  return Math.abs(z.x)<0.9999999 ? {x:Math.atan2(-z.y,z.z),y:ey,z:Math.atan2(-y.x,x.x)}
    : {x:Math.atan2(y.z,y.y),y:ey,z:0}
}
export const torsoEuler=(p:Pose):Vec3=>({x:p.torso,y:p.torsoYaw,z:p.torsoRoll})
export const shoulderEuler=(p:Pose,s:Side):Vec3=>({x:-p[`shoulder${s}X`],y:p[`shoulder${s}Y`],z:p[`shoulder${s}Z`]})
export const wristEuler=(p:Pose,s:Side):Vec3=>({x:p[`wrist${s}X`],y:p[`wrist${s}Y`],z:p[`wrist${s}Z`]})
export function torsoPoint(pose:Pose,p:Vec3):Vec3 {
  return add(rotateY(add(rotate(p,torsoEuler(pose)),{x:0,y:RIG.torsoY,z:0}),pose.pelvisYaw),{x:0,y:RIG.hipY+pose.rootY,z:0})
}
export function torsoVector(pose:Pose,p:Vec3):Vec3 {return rotateY(rotate(p,torsoEuler(pose)),pose.pelvisYaw)}
export function fromTorso(pose:Pose,p:Vec3):Vec3 {
  return unrotate(sub(rotateY(sub(p,{x:0,y:RIG.hipY+pose.rootY,z:0}),-pose.pelvisYaw),{x:0,y:RIG.torsoY,z:0}),torsoEuler(pose))
}
export function handPoint(pose:Pose,side:Side,point:Vec3):Vec3 {
  const wrist=add(rotateY(rotate(point,wristEuler(pose,side)),pose[`forearmRoll${side}`]),{x:0,y:-RIG.forearm,z:0})
  const arm=add(rotateX(wrist,-pose[`elbow${side}`]),{x:0,y:-RIG.upperArm,z:0})
  return torsoPoint(pose,add(rotate(arm,shoulderEuler(pose,side)),{x:(side==='L'?1:-1)*RIG.shoulderX,y:RIG.shoulderY,z:0}))
}
export function handLocal(pose:Pose,side:Side) {return handPoint(pose,side,{x:0,y:0,z:0})}
export const PALM_PAD:Vec3={x:0,y:-0.046,z:0.019}
export const FINGERS=[{x:-0.030,length:0.047},{x:-0.010,length:0.062},{x:0.010,length:0.067},{x:0.030,length:0.055}]
// The thumb roots and segments point toward the midline: left hand -X, right hand +X.
export const thumbBase=(side:Side):Vec3=>({x:(side==='L'?-1:1)*0.036,y:-0.021,z:0.004})
export const thumbAngle=(pose:Pose,side:Side):Vec3=>({x:-0.35-pose[`curl${side}`]*0.5,y:0,z:(side==='L'?-1:1)*(0.9+pose[`spread${side}`])})
/** Axial turning belongs to the forearm. The remaining wrist rotation is swing only. */
function setHandBasis(pose:Pose,side:Side,x:Vec3,y:Vec3,z:Vec3) {
  const e=eulerFromBasis(x,y,z)
  const cx=Math.cos(e.x/2),sx=Math.sin(e.x/2),cy=Math.cos(e.y/2),sy=Math.sin(e.y/2),cz=Math.cos(e.z/2),sz=Math.sin(e.z/2)
  const qy=cx*sy*cz-sx*cy*sz,qw=cx*cy*cz-sx*sy*sz
  const raw=2*Math.atan2(qy,qw),roll=Math.atan2(Math.sin(raw),Math.cos(raw))
  const wrist=eulerFromBasis(rotateY(x,-roll),rotateY(y,-roll),rotateY(z,-roll))
  pose[`forearmRoll${side}`]=roll
  pose[`wrist${side}X`]=wrist.x;pose[`wrist${side}Y`]=wrist.y;pose[`wrist${side}Z`]=wrist.z
}
export function fingerBase(side:Side,index:number):Vec3 {return {x:FINGERS[index].x*(side==='L'?-1:1),y:-0.077,z:0}}
export function fingerAngle(pose:Pose,side:Side,index:number):Vec3 {
  return {x:-pose[`curl${side}`],y:0,z:(index-1.5)*pose[`spread${side}`]*(side==='L'?-1:1)}
}
export function fingerPad(pose:Pose,side:Side,index=2):Vec3 {
  const l=FINGERS[index].length/2
  const tip=add({x:0,y:-l,z:0},rotateX({x:0,y:-l+0.007,z:0.008},-pose[`curl${side}`]*0.7))
  return add(fingerBase(side,index),rotate(tip,fingerAngle(pose,side,index)))
}
/** Fixed-length chain with a pole defining the elbow/knee plane. */
function limb(target:Vec3,pole:Vec3,a:number,b:number,bendSign=1) {
  const d=clamp(length(target),Math.abs(a-b)+1e-6,a+b-1e-6)
  const along=unit(target)
  let perpendicular=sub(pole,scale(along,dot(pole,along)))
  if(length(perpendicular)<1e-6) perpendicular=cross(along,{x:1,y:0,z:0})
  const bend=unit(perpendicular)
  const c=clamp((a*a+d*d-b*b)/(2*a*d),-1,1)
  const elbow=add(scale(along,a*c),scale(bend,a*Math.sqrt(1-c*c)))
  const upper=unit(elbow), lower=unit(sub(scale(along,d),elbow))
  const angle=Math.acos(clamp(dot(upper,lower),-1,1))
  const y=scale(upper,-1), z=scale(unit(sub(lower,scale(upper,Math.cos(angle)))),bendSign)
  return { rotation:eulerFromBasis(cross(y,z),y,z),angle:angle*bendSign }
}
/** Hand orientation is in character space; solve wrist and outward elbow together. */
export function reachHand(pose:Pose,side:Side,contact:Vec3,pad:Vec3,normal:Vec3,fingers:Vec3,pole?:Vec3) {
  const z=unit(normal), y=scale(unit(sub(fingers,scale(z,dot(fingers,z)))),-1), x=cross(y,z)
  const handRotation=eulerFromBasis(x,y,z)
  const wrist=sub(contact,rotate(pad,handRotation)), sign=side==='L'?1:-1
  const target=sub(fromTorso(pose,wrist),{x:sign*RIG.shoulderX,y:RIG.shoulderY,z:0})
  const solved=limb(target,pole ?? {x:sign,y:-0.35,z:0.15},RIG.upperArm,RIG.forearm)
  pose[`shoulder${side}X`]=-solved.rotation.x;pose[`shoulder${side}Y`]=solved.rotation.y;pose[`shoulder${side}Z`]=solved.rotation.z
  pose[`elbow${side}`]=solved.angle
  const intoForearm=(v:Vec3)=>rotateX(unrotate(unrotate(rotateY(v,-pose.pelvisYaw),torsoEuler(pose)),solved.rotation),solved.angle)
  setHandBasis(pose,side,intoForearm(x),intoForearm(y),intoForearm(z))
}
export function aimPalm(pose:Pose,side:Side,normal:Vec3,fingers:Vec3) {
  const z=unit(normal),y=scale(unit(sub(fingers,scale(z,dot(fingers,z)))),-1),x=cross(y,z)
  const intoFore=(v:Vec3)=>rotateX(unrotate(unrotate(rotateY(v,-pose.pelvisYaw),torsoEuler(pose)),shoulderEuler(pose,side)),pose[`elbow${side}`])
  setHandBasis(pose,side,intoFore(x),intoFore(y),intoFore(z))
}
/** Keep fingers along the forearm rather than forcing an upright hand through a bent wrist. */
export function aimNaturalPalm(pose:Pose,side:Side,normal:Vec3,upright=0) {
  const forearm=torsoVector(pose,rotate(rotateX({x:0,y:-1,z:0},-pose[`elbow${side}`]),shoulderEuler(pose,side)))
  aimPalm(pose,side,normal,add(scale(forearm,1-upright),{x:0,y:upright,z:0}))
}
export function solveLeg(pose:Pose,side:Side,ankle:Vec3,footYaw:number,footPitch=0) {
  const sign=side==='L'?1:-1
  const local=rotateY(sub(ankle,{x:0,y:RIG.hipY+pose.rootY,z:0}),-pose.pelvisYaw)
  const target=sub(local,{x:sign*RIG.hipX,y:RIG.legOriginY,z:0})
  const solved=limb(target,{x:0,y:0,z:1},RIG.thigh,RIG.shin,-1)
  pose[`hip${side}`]=-solved.rotation.x;pose[`hip${side}Y`]=solved.rotation.y;pose[`hip${side}Z`]=solved.rotation.z
  pose[`knee${side}`]=solved.angle
  const intoShin=(v:Vec3)=>rotateX(unrotate(rotateY(v,-pose.pelvisYaw),solved.rotation),solved.angle)
  const foot=(v:Vec3)=>rotateY(rotateX(v,footPitch),footYaw)
  const e=eulerFromBasis(intoShin(foot({x:1,y:0,z:0})),intoShin(foot({x:0,y:1,z:0})),intoShin(foot({x:0,y:0,z:1})))
  pose[`ankle${side}X`]=e.x;pose[`ankle${side}Y`]=e.y;pose[`ankle${side}Z`]=e.z
  return Math.max(0,length(target)-RIG.thigh-RIG.shin)
}
export function footPoint(pose:Pose,side:Side,p:Vec3):Vec3 {
  const ankle=rotate(p,{x:pose[`ankle${side}X`],y:pose[`ankle${side}Y`],z:pose[`ankle${side}Z`]})
  const lower=rotateX(add(ankle,{x:0,y:-RIG.shin,z:0}),-pose[`knee${side}`])
  const upper=rotate(add(lower,{x:0,y:-RIG.thigh,z:0}),{x:-pose[`hip${side}`],y:pose[`hip${side}Y`],z:pose[`hip${side}Z`]})
  return add(rotateY(add(upper,{x:(side==='L'?1:-1)*RIG.hipX,y:RIG.legOriginY,z:0}),pose.pelvisYaw),{x:0,y:RIG.hipY+pose.rootY,z:0})
}
