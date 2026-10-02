import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FINGERS, fingerAngle, fingerBase, thumbBase, thumbAngle, RIG, type Side } from '../../../logic/rig'
import type { Pose } from './poses'

const palmGeometry = new THREE.SphereGeometry(1, 10, 8)
const segmentGeometry = new THREE.CapsuleGeometry(1, 1, 3, 6)
const shoeGeometry = new THREE.BoxGeometry(0.105, 0.062, 0.2)
const soleGeometry = new THREE.BoxGeometry(0.115, 0.028, 0.215)
export function ArticulatedHand({side,pose,skin}:{side:Side;pose:RefObject<Pose>;skin:string}) {
  const forearm=useRef<THREE.Group>(null)
  const wrist=useRef<THREE.Group>(null)
  const fingers=useRef<(THREE.Group|null)[]>([]), tips=useRef<(THREE.Group|null)[]>([])
  const thumb=useRef<THREE.Group>(null)
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color:skin,roughness:0.65}),[skin])
  useFrame(()=>{
    const p=pose.current
    if(forearm.current) forearm.current.rotation.y=p[`forearmRoll${side}`]
    wrist.current?.rotation.set(p[`wrist${side}X`],p[`wrist${side}Y`],p[`wrist${side}Z`])
    FINGERS.forEach((_,i)=>{
      const a=fingerAngle(p,side,i)
      fingers.current[i]?.rotation.set(a.x,a.y,a.z)
      if(tips.current[i]) tips.current[i]!.rotation.x=-p[`curl${side}`]*0.7
    })
    const a=thumbAngle(p,side)
    thumb.current?.rotation.set(a.x,a.y,a.z)
  },-0.4)
  const base=thumbBase(side)
  return <group ref={forearm} position={[0,-RIG.forearm,0]}><group ref={wrist}>
    <mesh geometry={palmGeometry} material={material} position={[0,-0.039,0]} scale={[0.045,0.048,0.019]}/>
    {FINGERS.map((finger,i)=>{const base=fingerBase(side,i),half=finger.length/2;return <group key={i} ref={g=>{fingers.current[i]=g}} position={[base.x,base.y,base.z]}>
      <mesh geometry={segmentGeometry} material={material} position={[0,-half/2,0]} scale={[0.009,half/3,0.009]}/>
      <group ref={g=>{tips.current[i]=g}} position={[0,-half,0]}>
        <mesh geometry={segmentGeometry} material={material} position={[0,-half/2,0]} scale={[0.008,half/3,0.008]}/>
      </group>
    </group>})}
    <group ref={thumb} position={[base.x,base.y,base.z]}>
      <mesh geometry={segmentGeometry} material={material} position={[0,-0.024,0]} scale={[0.012,0.020,0.012]}/>
    </group>
  </group></group>
}
export function ArticulatedLeg({side,pose,skin}:{side:Side;pose:RefObject<Pose>;skin:string}) {
  const hip=useRef<THREE.Group>(null),knee=useRef<THREE.Group>(null),ankle=useRef<THREE.Group>(null)
  useFrame(()=>{const p=pose.current
    hip.current?.rotation.set(-p[`hip${side}`],p[`hip${side}Y`],p[`hip${side}Z`])
    if(knee.current) knee.current.rotation.x=-p[`knee${side}`]
    ankle.current?.rotation.set(p[`ankle${side}X`],p[`ankle${side}Y`],p[`ankle${side}Z`])
  },-0.4)
  return <group ref={hip} position={[(side==='L'?1:-1)*RIG.hipX,RIG.legOriginY,0]}>
    <mesh castShadow position={[0,-0.21,0]}><capsuleGeometry args={[0.068,0.26,4,12]}/><meshStandardMaterial color={skin}/></mesh>
    <mesh castShadow position={[0,-0.05,0]}><cylinderGeometry args={[0.085,0.08,0.13,14]}/><meshStandardMaterial color="#16305f"/></mesh>
    <group ref={knee} position={[0,-RIG.thigh,0]}>
      <mesh castShadow position={[0,-0.02,0.02]}><capsuleGeometry args={[0.062,0.08,4,12]}/><meshStandardMaterial color="#dfe3ec"/></mesh>
      <mesh castShadow position={[0,-0.16,0]}><capsuleGeometry args={[0.05,0.22,4,12]}/><meshStandardMaterial color={skin}/></mesh>
      <mesh position={[0,-0.315,0]}><cylinderGeometry args={[0.053,0.053,0.1,12]}/><meshStandardMaterial color="#f2f4f8"/></mesh>
      <group ref={ankle} position={[0,-RIG.shin,0]}>
        <mesh castShadow geometry={shoeGeometry} position={[0,0,0.045]}><meshStandardMaterial color="#eef1f6" roughness={0.45}/></mesh>
        <mesh geometry={soleGeometry} position={[0,-0.064,0.045]}><meshStandardMaterial color="#2b3140"/></mesh>
      </group>
    </group>
  </group>
}
