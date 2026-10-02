import * as THREE from 'three'
import type { Pose } from '../features/setplay/scene/poses'
import { FINGERS, RIG, type Side } from '../logic/rig'

// Independent Three hierarchy mirroring the rendered mesh nodes, not the IK equations.
export function renderedRig(p:Pose,frame:{x:number;z:number;yaw:number}) {
  const root=new THREE.Group();root.position.set(frame.x,p.rootY,frame.z);root.rotation.y=frame.yaw
  const pelvis=new THREE.Group();pelvis.position.y=RIG.hipY;pelvis.rotation.y=p.pelvisYaw;root.add(pelvis)
  const torso=new THREE.Group();torso.position.y=RIG.torsoY;torso.rotation.set(p.torso,p.torsoYaw,p.torsoRoll);pelvis.add(torso)
  const hands={} as Record<Side,{wrist:THREE.Group;palm:THREE.Object3D;pad:THREE.Object3D}>
  const feet={} as Record<Side,THREE.Group>
  for(const s of ['L','R'] as const) {
    const sign=s==='L'?1:-1
    const shoulder=new THREE.Group();shoulder.position.set(sign*RIG.shoulderX,RIG.shoulderY,0)
    shoulder.rotation.set(-p[`shoulder${s}X`],p[`shoulder${s}Y`],p[`shoulder${s}Z`]);torso.add(shoulder)
    const elbow=new THREE.Group();elbow.position.y=-RIG.upperArm;elbow.rotation.x=-p[`elbow${s}`];shoulder.add(elbow)
    const roll=new THREE.Group();roll.position.y=-RIG.forearm;roll.rotation.y=p[`forearmRoll${s}`];elbow.add(roll)
    const wrist=new THREE.Group();wrist.rotation.set(p[`wrist${s}X`],p[`wrist${s}Y`],p[`wrist${s}Z`]);roll.add(wrist)
    const palm=new THREE.Object3D();palm.position.set(0,-0.046,0.019);wrist.add(palm)
    const finger=new THREE.Group();finger.position.set(-FINGERS[2].x*sign,-0.077,0)
    finger.rotation.set(-p[`curl${s}`],0,-0.5*p[`spread${s}`]*sign);wrist.add(finger)
    const distal=new THREE.Group();distal.position.y=-FINGERS[2].length/2;distal.rotation.x=-p[`curl${s}`]*0.7;finger.add(distal)
    const pad=new THREE.Object3D();pad.position.set(0,-FINGERS[2].length/2+0.007,0.008);distal.add(pad)
    hands[s]={wrist,palm,pad}
    const hip=new THREE.Group();hip.position.set(sign*RIG.hipX,RIG.legOriginY,0);hip.rotation.set(-p[`hip${s}`],p[`hip${s}Y`],p[`hip${s}Z`]);pelvis.add(hip)
    const knee=new THREE.Group();knee.position.y=-RIG.thigh;knee.rotation.x=-p[`knee${s}`];hip.add(knee)
    const ankle=new THREE.Group();ankle.position.y=-RIG.shin;ankle.rotation.set(p[`ankle${s}X`],p[`ankle${s}Y`],p[`ankle${s}Z`]);knee.add(ankle);feet[s]=ankle
  }
  root.updateMatrixWorld(true)
  return {root,torso,hands,feet}
}
export const world=(p:THREE.Object3D)=>p.getWorldPosition(new THREE.Vector3())
