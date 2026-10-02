import type { SetDirection, Vec2, Vec3 } from '../types'
import { blendPose, clamp, copyPose, POSES, type Pose } from '../features/setplay/scene/poses'
import { add, BALL_RADIUS, fingerPad, reachHand, RIG, rotateY, scale, solveLeg, torsoPoint, torsoVector, unit } from './rig'

const smooth = (u:number)=>{const k=clamp(u,0,1);return k*k*(3-2*k)}
export const SETTER_CONTACT_START = 0.85 // final 90 ms of the default preparation
const WINDOW_Y=2.00    // 准备阶段球窗口的局部高度
const WINDOW_RISE=0.09 // 触球推送过程中球在窗口内的升高
// 出手瞬间球的局部高度，必须等于 handBallLocal(1).y：setterRootY 按它抬升重心衔接
// 出手高度，不同步会让 t=hold 处球位跳变。
const RELEASE_LOCAL_Y=WINDOW_Y+WINDOW_RISE
export function setterYaw(pos:Vec2,target:Vec2,direction:SetDirection) {
  return Math.atan2(target.x-pos.x,target.z-pos.z)+(direction==='back'?Math.PI:0)
}
export function setterRootY(t:number,height:number,hold=0.6) {
  const lift=height-RELEASE_LOCAL_Y
  if(lift>0.025) {
    const rise=Math.sqrt(2*(lift+0.006)/9.81), takeoff=hold-rise, landing=hold+rise
    if(t<takeoff) return -0.06-0.055*Math.sin(Math.PI*smooth(t/Math.max(0.01,takeoff)))
      +0.054*smooth((t-takeoff+0.09)/0.09)
    if(t<=landing) return lift-4.905*(t-hold)**2
    const u=t-landing
    return -0.006-0.13*Math.sin(Math.PI*clamp(u/0.22,0,1))-0.054*smooth(u/0.32)
  }
  return -0.06+(lift+0.06)*smooth(t/hold)+( -0.06-lift)*smooth((t-hold)/0.32)
}
/** Forehead window: anticipation, short elastic loading, then finger/elbow extension. */
function handBallLocal(t:number,direction:SetDirection,hold:number):Vec3 {
  const u=t/hold, k=smooth((u-SETTER_CONTACT_START)/(1-SETTER_CONTACT_START))
  const cushion=0.027*Math.sin(Math.PI*k)
  // Keep the ball in a comfortable forehead window, but in front of the face.
  // The extra reach gives both elbows room to extend instead of folding beside the cheeks.
  // 正传出手 z 前移 0.06：窗口顶点 (y2.09,z0.24) 是手臂最大触达内的上限，
  // 再高/再前指腹就够不到球面。
  return {x:0,y:WINDOW_Y+WINDOW_RISE*k-cushion,z:0.18+(direction==='back'?-0.36:0.06)*k}
}
export function setterRelease(pos:Vec2,target:Vec2,height:number,direction:SetDirection):Vec3 {
  const offset=rotateY(handBallLocal(1,direction,1),setterYaw(pos,target,direction))
  return {x:pos.x+offset.x,y:height,z:pos.z+offset.z}
}
export function sampleSetterPose(t:number,height:number,direction:SetDirection,out:Pose,hold=0.6):Pose {
  const actionT=Math.min(t,hold), u=actionT/hold
  const k=smooth((u-SETTER_CONTACT_START)/(1-SETTER_CONTACT_START))
  copyPose(out,POSES.setReady)
  out.torso=direction==='back'?-0.075*k:0.025*(1-k)
  out.rootY=setterRootY(t,height,hold)
  out.curlL=out.curlR=0.28+0.18*Math.sin(Math.PI*k)-0.13*k
  out.spreadL=out.spreadR=0.19
  // 托球掌心朝内上，腕部局部 X 轴反向：拇指张角取反并近垂直于四指展开，
  // 使拇指贴掌内缘指向面部，出手瞬间球底擦过拇指根属正常接触。
  out.thumbL=1.55
  out.thumbR=-1.55
  const ball=handBallLocal(actionT,direction,hold)
  ball.y+=out.rootY
  for(const side of ['L','R'] as const) {
    const s=side==='L'?1:-1
    const normal=unit({x:s*1.5,y:-0.70,z:-0.32})
    const contact=add(ball,scale(normal,BALL_RADIUS))
    reachHand(out,side,contact,fingerPad(out,side),scale(normal,-1),{x:s*0.50,y:0.9,z:-0.4})
  }
  if(t>hold) {
    // Hands continue briefly after release; the ball is no longer attached.
    const follow=smooth((t-hold)/0.07)
    out.elbowL*=1-0.15*follow;out.elbowR*=1-0.15*follow
    const rootY=out.rootY
    blendPose(out,out,POSES.idle,smooth((t-hold-0.08)/0.27))
    out.rootY=rootY
  }
  // 出手后手臂经体前落下（上方混合到 idle）；循环开始时对称地经体前举起，
  // 否则循环边界处手臂会从体侧瞬移回举球位。
  const riseT=hold*0.75
  if(t<riseT) {
    const rootY=out.rootY
    blendPose(out,POSES.idle,out,smooth(t/riseT))
    out.rootY=rootY
  }
  const air=Math.max(0,out.rootY+0.006)
  solveLeg(out,'L',{x:RIG.hipX,y:RIG.ankleHeight+air,z:0.045},0)
  solveLeg(out,'R',{x:-RIG.hipX,y:RIG.ankleHeight+air,z:-0.045},0)
  return out
}
export function sampleSetterView(pos:Vec2,target:Vec2,height:number,direction:SetDirection,t:number,out:Pose,hold=0.6) {
  const pose=sampleSetterPose(t,height,direction,out,hold),yaw=setterYaw(pos,target,direction)
  const eye=rotateY(torsoPoint(pose,{x:0,y:RIG.headY+RIG.eyeY,z:RIG.eyeZ}),yaw)
  eye.x+=pos.x;eye.z+=pos.z
  return {eye,forward:rotateY(torsoVector(pose,{x:0,y:0,z:1}),yaw)}
}
export function sampleSetterBall(pos:Vec2,target:Vec2,height:number,direction:SetDirection,t:number,hold=0.6):Vec3 {
  const ball=handBallLocal(Math.min(t,hold),direction,hold)
  ball.y+=setterRootY(Math.min(t,hold),height,hold)
  const arrival=hold*SETTER_CONTACT_START
  if(t<arrival) {
    const incoming=1-smooth(t/arrival)
    ball.y+=0.85*incoming;ball.z+=0.42*incoming
  }
  const world=rotateY(ball,setterYaw(pos,target,direction))
  return {x:pos.x+world.x,y:world.y,z:pos.z+world.z}
}
