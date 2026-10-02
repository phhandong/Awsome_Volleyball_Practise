import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { planAttacker } from '../logic/approach'
import { BALL_RADIUS, RIG, handPoint, fingerPad, PALM_PAD, thumbBase, thumbAngle, rotate, add } from '../logic/rig'
import { generateRoutes } from '../logic/presets'
import { DEFAULT_FORMATION } from '../logic/court'
import { sampleAttacker, sampleGroundFoot } from '../features/setplay/scene/attackerMotion'
import { createScratchPose } from '../features/setplay/scene/poses'
import { sampleSetterBall, sampleSetterPose, setterYaw, setterRootY } from '../logic/setterMotion'
import { renderedRig, world } from './renderedRig'
const sample=(plan:ReturnType<typeof planAttacker>,t:number)=>{
  const pose=createScratchPose(),frame={x:0,z:0,yaw:0};sampleAttacker(plan,t,pose,frame)
  return {pose,frame,rig:renderedRig(pose,frame)}
}
const standard=(steps:2|3|4=3)=>planAttacker({x:2.4,z:0.4},{x:0,z:0},2.85,1.05,steps)

describe('完整骨架与支撑约束',()=>{
  it('五种推荐、零距离、极短时间和高低击球点均无非有限关节值，重复采样稳定',()=>{
    const routes=Object.values(generateRoutes(DEFAULT_FORMATION[0],DEFAULT_FORMATION[1])).flat()
    const plans=routes.map(r=>planAttacker(r.stand,r.params.target,r.params.contactH,r.metrics.flightT))
    plans.push(planAttacker({x:1,z:4},{x:1,z:4},2,0.06),planAttacker({x:8,z:1},{x:0.25,z:8},3.4,0.08,4))
    for(const p of plans) {
      for(let i=0;i<=80;i++) {
        const t=(p.landingT+0.4)*i/80,{pose,frame}=sample(p,t)
        expect([...Object.values(pose),...Object.values(frame)].every(Number.isFinite)).toBe(true)
      }
      const a=sample(p,p.events.cock),b=sample(p,p.events.cock)
      expect(a.pose).toEqual(b.pose)
    }
  })
  it.each([2,3,4] as const)('%s步支撑脚固定且鞋底不穿地，渲染关节与脚步标记一致',steps=>{
    const plan=standard(steps)
    for(let i=0;i<=160;i++) {
      const t=plan.startT+plan.runT*i/160,{rig}=sample(plan,t)
      for(const side of ['L','R'] as const) {
        const foot=sampleGroundFoot(plan,side,t),ankle=world(rig.feet[side])
        expect(ankle.distanceTo(new THREE.Vector3(foot.position.x,foot.position.y,foot.position.z)),`${steps} ${side} t=${t}`).toBeLessThan(0.006)
        const sole=rig.feet[side].localToWorld(new THREE.Vector3(0,-RIG.ankleHeight,0))
        expect(sole.y).toBeGreaterThan(-0.003)
        if(foot.planted)expect(sole.y).toBeCloseTo(0,5)
      }
    }
  })
  it('起跳脚边缘判定来自实际旋转鞋底，而非旧姿态的近似投影',()=>{
    const p=standard(),{rig}=sample(p,p.takeoffT)
    const corners=[]
    for(const side of ['L','R'] as const)for(const x of [-0.0575,0.0575])for(const z of [0.045-0.1075,0.045+0.1075])
      corners.push(rig.feet[side].localToWorld(new THREE.Vector3(x,-RIG.ankleHeight,z)).x)
    expect(Math.min(...corners)).toBeCloseTo(p.takeoffFootX,6)
  })
  it('关键相位在实际手脚位置上连续，含起跳、触球、落地',()=>{
    const p=standard()
    const events=[p.startT,p.takeoffT,p.events.cock,p.events.accelerate,p.contactT,p.contactT+0.14,p.landingT,p.landingT+p.brakeT,
      ...p.footfalls.flatMap(f=>[f.liftT,f.plantT,f.releaseT])]
    for(const t of events) {
      const a=sample(p,t-1e-6),b=sample(p,t+1e-6)
      for(const side of ['L','R'] as const) {
        expect(world(a.rig.hands[side].palm).distanceTo(world(b.rig.hands[side].palm)),`hand ${side} at ${t}`).toBeLessThan(0.0001)
        expect(world(a.rig.feet[side]).distanceTo(world(b.rig.feet[side])),`foot ${side} at ${t}`).toBeLessThan(0.0001)
      }
    }
  })
  it('引臂有髋肩分离，挥臂先伸肘，触球掌面朝向球',()=>{
    const p=standard(),cock=sample(p,p.events.cock),accelerate=sample(p,p.events.accelerate),hit=sample(p,p.contactT)
    expect(Math.abs(cock.pose.torsoYaw)).toBeGreaterThan(0.35)
    expect(accelerate.pose.pelvisYaw).toBeGreaterThan(cock.pose.pelvisYaw)
    expect(accelerate.pose.torsoYaw).toBeLessThan(0)
    expect(cock.pose.elbowR).toBeGreaterThan(accelerate.pose.elbowR)
    expect(accelerate.pose.elbowR).toBeGreaterThan(hit.pose.elbowR)
    const normal=new THREE.Vector3(0,0,1).transformDirection(hit.rig.hands.R.wrist.matrixWorld)
    expect(normal.dot(new THREE.Vector3(-1,0,0))).toBeCloseTo(1,9)
    const actual=world(hit.rig.hands.R.palm),calculated=handPoint(hit.pose,'R',PALM_PAD)
    const computed=new THREE.Vector3(calculated.x,calculated.y,calculated.z).applyAxisAngle(new THREE.Vector3(0,1,0),hit.frame.yaw).add(new THREE.Vector3(hit.frame.x,0,hit.frame.z))
    expect(actual.distanceTo(computed)).toBeLessThan(1e-9)
  })
  it('落地支撑脚在制动期间保持世界坐标',()=>{
    const p=standard(),first=sample(p,p.landingT)
    for(const dt of [0.01,0.05,0.1,0.2,0.4]) {
      const next=sample(p,p.landingT+dt)
      for(const s of ['L','R'] as const)expect(world(first.rig.feet[s]).distanceTo(world(next.rig.feet[s]))).toBeLessThan(1e-6)
    }
  })
  it('引臂至随挥掌面连续，手腕不反折，触球拇指朝身体内侧',()=>{
    const p=standard()
    let prev:THREE.Quaternion|undefined
    for(let i=0;i<=200;i++) {
      const t=p.takeoffT+(p.contactT+0.14-p.takeoffT)*i/200
      const {pose,rig}=sample(p,t)
      const q=rig.hands.R.wrist.getWorldQuaternion(new THREE.Quaternion())
      if(prev)expect(prev.angleTo(q),`palm jump at ${t}`).toBeLessThan(0.20)
      prev=q
      // Remaining wrist swing is separated from forearm pronation/supination.
      const fingers=new THREE.Vector3(0,-1,0).applyEuler(new THREE.Euler(pose.wristRX,pose.wristRY,pose.wristRZ))
      expect(fingers.angleTo(new THREE.Vector3(0,-1,0)),`wrist at ${t}`).toBeLessThan(1.2)
    }
    const {pose}=sample(p,p.contactT)
    expect(thumbBase('R').x).toBeGreaterThan(0)
    expect(thumbAngle(pose,'R').z).toBeGreaterThan(0)
  })
  it('主攻左手保持自然中立腕姿，随前臂运动而转动',()=>{
    const p=standard()
    for(let i=0;i<=120;i++) {
      const t=(p.landingT+0.35)*i/120
      const {pose,rig}=sample(p,t)
      expect(Math.hypot(pose.wristLX,pose.wristLY,pose.wristLZ)).toBeLessThan(0.25)
      expect(Math.abs(pose.forearmRollL)).toBeLessThan(0.25)
      const palmNormal=new THREE.Vector3(0,0,1).transformDirection(rig.hands.L.wrist.matrixWorld)
      expect(palmNormal.length()).toBeCloseTo(1,8)
      const thumb=handPoint(pose,'L',add(thumbBase('L'),rotate({x:0,y:-0.024,z:0},thumbAngle(pose,'L'))))
      const palm=handPoint(pose,'L',PALM_PAD)
      expect(thumb.x).toBeLessThan(palm.x)
      expect([...Object.values(pose)].every(Number.isFinite)).toBe(true)
    }
  })
})

describe('二传短接触与跳传',()=>{
  it('正背传全部准备与接触姿势的拇指均在内侧，左右手不互换',()=>{
    for(const direction of ['front','back'] as const)for(const height of [1.8,2.2,2.6])for(let i=0;i<=60;i++) {
      const pose=sampleSetterPose(i/100,height,direction,createScratchPose())
      for(const side of ['L','R'] as const) {
      const thumb=thumbBase(side),angle=thumbAngle(pose,side)
      expect(thumb.x*(side==='L'?-1:1)).toBeGreaterThan(0)
      expect(angle.z*(side==='L'?-1:1)).toBeGreaterThan(0)
      }
    }
  })
  it.each(['front','back'] as const)('%s 指腹只在最终接触窗口贴球',direction=>{
    const pos={x:0,z:0},target={x:0,z:4},yaw=setterYaw(pos,target,direction)
    for(const height of [1.8,2.2,2.6])for(const t of [0.2,0.4,0.51,0.54,0.57,0.6]) {
      const pose=sampleSetterPose(t,height,direction,createScratchPose()),ball=sampleSetterBall(pos,target,height,direction,t)
      const rig=renderedRig(pose,{...pos,yaw}),center=new THREE.Vector3(ball.x,ball.y,ball.z)
      for(const s of ['L','R'] as const) {
        const distance=center.distanceTo(world(rig.hands[s].pad))
        if(t<0.51)expect(distance).toBeGreaterThan(BALL_RADIUS+0.01)
        else expect(distance).toBeCloseTo(BALL_RADIUS,8)
        const p=handPoint(pose,s,fingerPad(pose,s))
        const projected=new THREE.Vector3(p.x,p.y,p.z).applyAxisAngle(new THREE.Vector3(0,1,0),yaw)
        expect(projected.distanceTo(world(rig.hands[s].pad))).toBeLessThan(1e-8)
      }
    }
  })
  it('跳传出手后继续按重力下落，不悬停；二传各相位无手脚瞬移',()=>{
    expect(setterRootY(0.7,2.2)).toBeLessThan(setterRootY(0.6,2.2))
    for(const height of [1.8,2.2,2.6])for(const direction of ['front','back'] as const) {
      const times=[0.51,0.6,0.68,0.95]
      if(height>2.025) {const rise=Math.sqrt(2*(height-2+0.006)/9.81);times.push(0.6-rise,0.6+rise)}
      for(const t of times) {
        const a=sampleSetterPose(t-1e-6,height,direction,createScratchPose()),b=sampleSetterPose(t+1e-6,height,direction,createScratchPose())
        const ar=renderedRig(a,{x:0,z:0,yaw:0}),br=renderedRig(b,{x:0,z:0,yaw:0})
        expect(world(ar.hands.L.pad).distanceTo(world(br.hands.L.pad)),`${direction} h=${height} t=${t}`).toBeLessThan(0.0001)
        expect(world(ar.feet.L).distanceTo(world(br.feet.L))).toBeLessThan(0.0001)
      }
    }
  })
  it('二传双手在所有接触前后姿态都离脸更远，正传背传一致',()=>{
    for(const direction of ['front','back'] as const) for(const height of [1.8,2.2,2.6]) {
      for(const t of [0,0.2,0.4,0.51,0.57,0.6,0.72]) {
        const pose=sampleSetterPose(t,height,direction,createScratchPose())
        const rig=renderedRig(pose,{x:0,z:0,yaw:0})
        const faceZ=0.098
        for(const side of ['L','R'] as const) expect(Math.abs(world(rig.hands[side].palm).z-faceZ)).toBeGreaterThan(0.06)
      }
    }
  })
})
