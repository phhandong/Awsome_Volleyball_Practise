import * as THREE from 'three'
import { blendPose, clamp, POSES, type Pose } from './poses'
import { ATTACK_YAW, groundMove, type AttackerPlan } from '../../../logic/approach'
import { ATTACK_POSES, attackAirPose, smooth } from '../../../logic/attackPoses'
import { aimNaturalPalm, footPoint, handPoint, PALM_PAD, RIG, rotateY, solveLeg, type Side } from '../../../logic/rig'
import type { Vec3 } from '../../../types'
export { planAttacker, AIR_SPEED } from '../../../logic/approach'
export { RIG, BALL_RADIUS } from '../../../logic/rig'
export function rightHandLocal(pose:Pose,out=new THREE.Vector3()) {const p=handPoint(pose,'R',PALM_PAD);return out.set(p.x,p.y,p.z)}
export interface AttackerFrame {x:number;z:number;yaw:number}
export interface FootFrame {position:Vec3;yaw:number;planted:boolean}
const mix=(a:number,b:number,k:number)=>a+(b-a)*k
const angleMix=(a:number,b:number,k:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*k
export function sampleGroundFoot(plan:AttackerPlan,side:Side,t:number):FootFrame {
  let prev=plan.initialFeet[side],yaw=plan.runYaw
  for(const f of plan.footfalls.filter(f=>f.side===side)) {
    if(t<f.liftT) break
    if(t<f.plantT) {
      const u=clamp((t-f.liftT)/(f.plantT-f.liftT),0,1)
      const bias=f===plan.footfalls.at(-1)?0.18:-0.15
      const k=smooth(u+bias*Math.sin(Math.PI*u))
      return {position:{x:mix(prev.x,f.position.x,k),y:RIG.ankleHeight+0.14*Math.sin(Math.PI*u)**2,z:mix(prev.z,f.position.z,k)},yaw:angleMix(yaw,f.yaw,k),planted:false}
    }
    prev=f.position;yaw=f.yaw
  }
  return {position:{...prev,y:RIG.ankleHeight},yaw,planted:t<=plan.takeoffT}
}
function fitFeet(pose:Pose,frame:AttackerFrame,feet:Record<Side,FootFrame>,adjustHeight:boolean) {
  if(adjustHeight) {
    // Lower the pelvis only as far as fixed leg lengths require. Never scale limbs.
    for(const side of ['L','R'] as const) {
      const p=rotateY({x:feet[side].position.x-frame.x,y:feet[side].position.y,z:feet[side].position.z-frame.z},-frame.yaw-pose.pelvisYaw)
      const dx=p.x-(side==='L'?1:-1)*RIG.hipX
      const maxY=Math.sqrt(Math.max(0.16,(RIG.thigh+RIG.shin-0.004)**2-dx*dx-p.z*p.z))
      pose.rootY=Math.min(pose.rootY,p.y+maxY-RIG.hipY-RIG.legOriginY)
    }
  }
  for(const side of ['L','R'] as const) {
    const foot=feet[side],local=rotateY({x:foot.position.x-frame.x,y:foot.position.y,z:foot.position.z-frame.z},-frame.yaw)
    solveLeg(pose,side,local,foot.yaw-frame.yaw)
  }
}
const legKeys=(['hipL','hipR','hipLY','hipRY','hipLZ','hipRZ','kneeL','kneeR','ankleLX','ankleLY','ankleLZ','ankleRX','ankleRY','ankleRZ'] as const)
function groundedPose(plan:AttackerPlan,t:number,pose:Pose,frame:AttackerFrame) {
  fitFeet(pose,frame,{L:sampleGroundFoot(plan,'L',t),R:sampleGroundFoot(plan,'R',t)},true)
}
/** Deterministic event-based sampling, including feet and wrist articulation. */
export function sampleAttacker(plan:AttackerPlan,t:number,pose:Pose,out:AttackerFrame):void {
  const runU=clamp((t-plan.startT)/plan.runT,0,1)
  const dir={x:Math.sin(plan.runYaw),z:Math.cos(plan.runYaw)}
  if(t<plan.takeoffT) {
    const d=groundMove(runU,plan.distance,plan.runT,plan.airSpeed)
    out.x=plan.stand.x+dir.x*d;out.z=plan.stand.z+dir.z*d
  } else if(t<=plan.landingT) {
    const a=t-plan.takeoffT
    out.x=plan.takeoffRoot.x+plan.airVelocity.x*a;out.z=plan.takeoffRoot.z+plan.airVelocity.z*a
  } else {
    const a=clamp(t-plan.landingT,0,plan.brakeT),d=a-a*a/(2*plan.brakeT)
    out.x=plan.landingRoot.x+plan.airVelocity.x*d;out.z=plan.landingRoot.z+plan.airVelocity.z*d
  }
  out.yaw=angleMix(plan.runYaw,ATTACK_YAW,smooth((runU-0.5)/0.5))
  if(t<plan.takeoffT) {
    const loadU=(plan.events.load-plan.startT)/plan.runT
    if(runU<loadU) {
      blendPose(pose,ATTACK_POSES.ready,ATTACK_POSES.run,smooth(runU/0.18))
      const swing=Math.sin(runU*Math.PI*plan.steps*2)*0.35
      pose.shoulderLX+=swing;pose.shoulderRX-=swing
      const k=smooth((runU-(loadU-0.22))/0.22)
      blendPose(pose,pose,ATTACK_POSES.load,k)
    } else blendPose(pose,ATTACK_POSES.load,ATTACK_POSES.takeoff,smooth((runU-loadU)/(1-loadU)))
    groundedPose(plan,t,pose,out)
  } else if(t<=plan.contactT) {
    const u=clamp((t-plan.takeoffT)/plan.riseT,0,1)
    attackAirPose(u,pose)
    const launch={...ATTACK_POSES.takeoff}
    const launchFrame={x:plan.takeoffRoot.x,z:plan.takeoffRoot.z,yaw:ATTACK_YAW}
    groundedPose(plan,plan.takeoffT,launch,launchFrame)
    const legK=smooth(u/0.5)
    for(const key of legKeys)pose[key]=mix(launch[key],pose[key],legK)
    pose.rootY=plan.launchY+plan.jumpH-4.905*(t-plan.contactT)**2
  } else {
    const after=t-plan.contactT
    if(after<0.14)blendPose(pose,ATTACK_POSES.contact,ATTACK_POSES.follow,smooth(after/0.14))
    else blendPose(pose,ATTACK_POSES.follow,ATTACK_POSES.landing,smooth((t-plan.landingT+0.16)/0.16))
    if(after<0.14) {
      const k=smooth(after/0.14)
      aimNaturalPalm(pose,'R',{x:0.2*k,y:-0.85*k,z:1-0.55*k},1-k)
    }
    if(t<=plan.landingT) {
      pose.rootY=plan.launchY+plan.jumpH-4.905*after*after
      const landing={...ATTACK_POSES.landing,rootY:plan.launchY}
      for(const side of ['L','R'] as const)solveLeg(landing,side,{x:(side==='L'?1:-1)*RIG.hipX,y:RIG.ankleHeight,z:0},0)
      const k=smooth((t-plan.landingT+0.12)/0.12)
      for(const key of legKeys)pose[key]=mix(pose[key],landing[key],k)
    } else {
      const u=t-plan.landingT
      blendPose(pose,ATTACK_POSES.landing,POSES.idle,smooth(u/0.35))
      pose.rootY=plan.launchY-0.15*Math.sin(Math.PI*clamp(u/0.3,0,1))-0.05*smooth(u/0.35)
      // Landing foot anchors stay on the ground while the COM brakes above them.
      const feet={} as Record<Side,FootFrame>
      for(const side of ['L','R'] as const) {
        const offset=rotateY({x:(side==='L'?1:-1)*RIG.hipX,y:0,z:0},ATTACK_YAW)
        feet[side]={position:{x:plan.landingRoot.x+offset.x,y:RIG.ankleHeight,z:plan.landingRoot.z+offset.z},yaw:ATTACK_YAW,planted:true}
      }
      fitFeet(pose,out,feet,true)
    }
  }
}
export function renderedFootWorld(pose:Pose,frame:AttackerFrame,side:Side,point:Vec3={x:0,y:-RIG.ankleHeight,z:0}) {
  const p=rotateY(footPoint(pose,side,point),frame.yaw)
  return {x:p.x+frame.x,y:p.y,z:p.z+frame.z}
}
