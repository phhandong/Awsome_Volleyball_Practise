import { blendPose, POSES, type Pose } from '../features/setplay/scene/poses'
import { aimNaturalPalm, aimPalm, reachHand, unit } from './rig'

const pose=(values:Partial<Pose>):Pose=>({...POSES.spikeRun,...values})
// 掌面朝前的起跳、挥臂与随挥共用朝内的右手拇指，避免触球前后插值穿过掌心。
const inwardRightThumb = { thumbR: -1.55 }
export const ATTACK_POSES = {
  ready:pose({...POSES.receive,torso:0.16,rootY:-0.09}),
  run:pose({torso:0.22,rootY:-0.085,shoulderLX:0.4,shoulderRX:-0.25,elbowL:0.5,elbowR:0.5}),
  load:pose({torso:0.32,rootY:-0.22,shoulderLX:-1.1,shoulderRX:-1.1,elbowL:0.25,elbowR:0.25,pelvisYaw:-0.12,torsoYaw:-0.13}),
  takeoff:pose({...inwardRightThumb,torso:0.02,rootY:-0.012,shoulderLX:1.8,shoulderRX:1.65,elbowL:0.25,elbowR:0.6,pelvisYaw:-0.26,torsoYaw:-0.18,hipL:0.05,hipR:0.05,kneeL:-0.1,kneeR:-0.1}),
  cock:pose({torso:-0.22,rootY:0,shoulderLX:2.35,shoulderLZ:0.12,elbowL:0.28,
    shoulderRX:1.65,shoulderRY:-0.8,shoulderRZ:-0.85,elbowR:1.8,pelvisYaw:-0.20,torsoYaw:-0.50,torsoRoll:-0.05,
    hipL:-0.1,hipR:-0.16,kneeL:-0.6,kneeR:-0.75,wristRX:-0.15,curlR:0.06,spreadR:0.12,...inwardRightThumb}),
  accelerate:pose({torso:-0.10,rootY:0,shoulderLX:1.4,shoulderLZ:0.25,elbowL:1.3,
    shoulderRX:2.65,shoulderRY:-0.28,shoulderRZ:-0.25,elbowR:0.95,pelvisYaw:0.10,torsoYaw:-0.18,torsoRoll:0.04,
    hipL:0.05,hipR:-0.05,kneeL:-0.3,kneeR:-0.45,curlR:0.04,spreadR:0.12,...inwardRightThumb}),
  contact:pose({...POSES.spikeJump,torso:0.00,shoulderRX:2.82,shoulderRY:0,shoulderRZ:-0.13,elbowR:0.18,
    shoulderLX:0.65,shoulderLZ:0.32,elbowL:1.45,pelvisYaw:0.13,torsoYaw:0.02,torsoRoll:0.07,
    curlR:0.05,spreadR:0.12,
    // 扣球掌心翻转朝前，腕部局部 X 轴反向：拇指张角取反才落在食指侧指向身体内侧。
    ...inwardRightThumb}),
  follow:pose({...POSES.spikeFollow,shoulderRX:1.05,shoulderRY:0.45,shoulderRZ:0.48,elbowR:0.28,
    shoulderLX:0.25,elbowL:1.1,pelvisYaw:0.23,torsoYaw:0.38,torsoRoll:0.10,torso:0.28,wristRX:-0.8,
    hipL:0.12,hipR:0.20,kneeL:-0.42,kneeR:-0.55,rootY:0,...inwardRightThumb}),
  landing:pose({...POSES.idle,torso:0.14,rootY:-0.012,shoulderRX:0.3,shoulderRZ:0.1,elbowR:0.4}),
}
// High elbow and a hand behind the head: shoulder external rotation, not a low sidearm throw.
reachHand(ATTACK_POSES.cock,'R',{x:-0.25,y:1.75,z:-0.30},{x:0,y:0,z:0},{x:0,y:0.15,z:1},{x:0,y:1,z:0},{x:-1,y:0.8,z:0.1})
// An open palm meets the rear surface of the ball; wrist orientation is explicit.
aimPalm(ATTACK_POSES.contact,'R',{x:0,y:0,z:1},{x:0,y:1,z:0})
aimNaturalPalm(ATTACK_POSES.takeoff,'R',{x:0.15,y:0.05,z:1})
aimNaturalPalm(ATTACK_POSES.cock,'R',{x:0.15,y:0.1,z:1})
aimNaturalPalm(ATTACK_POSES.accelerate,'R',{x:0.08,y:0.02,z:1})
aimNaturalPalm(ATTACK_POSES.follow,'R',{x:0.2,y:-0.85,z:0.45})
export const smooth=(u:number)=>{const k=Math.max(0,Math.min(1,u));return k*k*(3-2*k)}
export function attackAirPose(u:number,out:Pose) {
  const frames:[number,Pose][]=[[0,ATTACK_POSES.takeoff],[0.56,ATTACK_POSES.cock],[0.84,ATTACK_POSES.accelerate],[1,ATTACK_POSES.contact]]
  for(let i=1;i<frames.length;i++) if(u<=frames[i][0]) {
    blendPose(out,frames[i-1][1],frames[i][1],smooth((u-frames[i-1][0])/(frames[i][0]-frames[i-1][0])))
    // Recompute palm from the sampled arm: independently interpolated Euler wrist
    // angles otherwise corkscrew between equivalent rotation representations.
    aimNaturalPalm(out,'R',unit({x:0.15*(1-u),y:0.05*(1-u),z:1}),smooth((u-0.84)/0.16))
    return out
  }
  return blendPose(out,ATTACK_POSES.contact,ATTACK_POSES.contact,0)
}
