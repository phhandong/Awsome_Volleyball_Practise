import { useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Character } from '../features/setplay/scene/Characters'
import { BallSurface } from '../features/setplay/scene/BallSurface'
import { playback } from '../features/setplay/animation'
import { planAttacker } from '../logic/approach'
import { sampleSetterBall, setterRelease } from '../logic/setterMotion'
import { useSceneStore } from '../store/sceneStore'
import type { PlayerState } from '../types'

const setter: PlayerState = { ...useSceneStore.getState().players[0], pos: { x: 0, z: 0 } }
const attacker: PlayerState = { ...useSceneStore.getState().players[1], pos: { x: 2.4, z: 0.4 } }
const target = { x: 0, z: 0 }
const plan = () => planAttacker(attacker.pos, target, 2.85, 1.05, useSceneStore.getState().params.approachSteps)
const stages = ['二传准备', '二传触球', '二传出手', '助跑倒数第二步', '起跳', '引臂', '挥臂', '扣球触球', '随挥', '落地']
function stageTime(stage: number) {
  const p = plan()
  return [0.5, 0.54, 0.6, p.startT + p.runT * 0.68, p.takeoffT,
    p.takeoffT + p.riseT * 0.6, p.contactT - p.riseT * 0.1, p.contactT,
    p.contactT + 0.12, p.landingT + 0.08][stage]
}
function Figure({ stage, live, speed, ballVisible, closeup }: { stage: number; live: boolean; speed: number; ballVisible:boolean; closeup:boolean }) {
  useFrame((_, dt) => {
    playback.playing = false
    playback.t = live ? (playback.t + dt * speed) % (plan().landingT + 0.6) : stageTime(stage)
  }, -3)
  const isSetter = stage < 3
  return <>
    <Character player={isSetter ? setter : attacker} index={isSetter ? 0 : 1} isSetter={isSetter} isAttacker={!isSetter}
      hidden={false} showLabel={!closeup} flightT={1.05} attackT={0.5} target={isSetter ? { x: -4, z: 0 } : target} contactH={2.85}/>
    <ReviewBall setter={isSetter} visible={ballVisible}/>
  </>
}
function ReviewBall({ setter: isSetter, visible }: { setter: boolean; visible:boolean }) {
  const [ref] = useState(() => ({ current: null as import('three').Mesh | null }))
  useFrame(() => {
    if (!ref.current) return
    const direction = useSceneStore.getState().params.setDirection
    const time = playback.t
    const pos = isSetter ? (time <= 0.6 ? sampleSetterBall(setter.pos, {x:-4,z:0}, 2.2, direction, time)
      : setterRelease(setter.pos, {x:-4,z:0}, 2.2, direction)) : { x: 0, y: 2.85, z: 0 }
    ref.current.position.set(pos.x, pos.y, pos.z)
    ref.current.visible = visible && (isSetter ? time <= 0.6 : Math.abs(time - plan().contactT) < 0.025)
  }, -1)
  return <mesh ref={ref}><BallSurface /></mesh>
}
export default function Review() {
  const [ballVisible,setBallVisible]=useState(true)
  const [stage, setStage] = useState(5)
  const [view, setView] = useState('side')
  const [live, setLive] = useState(false)
  const [speed, setSpeed] = useState(0.25)
  const focusY=stage<3?2.02:stage===5?2.65:stage===8?2.4:stage===9?1.7:2.82
  const camera: [number, number, number] = view === 'hand' ? [-1.35,focusY+0.16,0.08] : view === 'front' ? [-5,2.1,0] : view === 'back' ? [5,2.1,0] : [0,2.1,5]
  return <main style={{fontFamily:'system-ui',background:'#e8edf3',color:'#182c42',height:'100vh',display:'flex',flexDirection:'column'}}>
    <header style={{padding:'12px 18px',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <b>排球动作 · 关键帧核对</b>
      <select aria-label="动作阶段" value={stage} onChange={e=>{setStage(+e.target.value);setLive(false)}}>{stages.map((s,i)=><option key={s} value={i}>{s}</option>)}</select>
      <select aria-label="观察机位" value={view} onChange={e=>setView(e.target.value)}><option value="side">侧面</option><option value="front">正面</option><option value="back">背面</option><option value="hand">手部近景</option></select>
      <select aria-label="传球方向" onChange={e=>useSceneStore.getState().setParams({setDirection:e.target.value as 'front'|'back'})}><option value="front">正传</option><option value="back">背传</option></select>
      <select aria-label="助跑步数" defaultValue="3" onChange={e=>useSceneStore.getState().setParams({approachSteps:+e.target.value as 2|3|4})}><option value="2">两步</option><option value="3">三步</option><option value="4">四步</option></select>
      <button onClick={()=>{playback.t=0;setLive(!live)}}>{live?'暂停':'播放'}</button>
      <select aria-label="速度" value={speed} onChange={e=>setSpeed(+e.target.value)}><option value="0.25">0.25×</option><option value="1">1×</option></select>
      <label><input type="checkbox" checked={ballVisible} onChange={e=>setBallVisible(e.target.checked)}/>显示球</label>
    </header>
    <div style={{flex:1,minHeight:0}}><Canvas key={view==='hand'?`${view}-${stage}`:view} shadows camera={{position:camera,fov:43}}>
      <color attach="background" args={['#e8edf3']}/><ambientLight intensity={1.7}/><directionalLight position={[-3,6,4]} intensity={2.5} castShadow/>
      <Figure stage={stage} live={live} speed={speed} ballVisible={ballVisible} closeup={view==='hand'}/>
      <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[30,30]}/><meshStandardMaterial color="#cbd8e2"/></mesh>
      <gridHelper args={[12,24,'#92a8ba','#bacbd9']}/><OrbitControls target={view==='hand'?[0,focusY,0.08]:[0.4,1.65,0]} />
    </Canvas></div>
    <footer style={{padding:'8px 18px'}}>固定机位与事件时刻；可旋转查看。参考资料见 MOTION_REFERENCE.md。</footer>
  </main>
}

