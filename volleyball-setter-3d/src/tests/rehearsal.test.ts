import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sampleSetterBall, sampleSetterPose, setterRelease, setterYaw } from '../logic/setterMotion'
import { BALL_RADIUS, RIG } from '../logic/rig'
import { footSequence, groundMove, planAttacker, stepEnds } from '../logic/approach'
import { createScratchPose, type Pose } from '../features/setplay/scene/poses'
import { sampleAttacker } from '../features/setplay/scene/attackerMotion'
import { evaluateQuality } from '../logic/quality'
import { solveByTime } from '../logic/trajectory'
import { DEFAULT_FORMATION } from '../logic/court'
import { DEFAULT_PARAMS, exportScene, importScene, useSceneStore } from '../store/sceneStore'
import type { SetDirection, Vec2, ZoneId } from '../types'

const saved = useSceneStore.getState()
afterEach(() => useSceneStore.setState(saved))
const pos = { x: 0.7, z: 1.6 }
const target = { x: 1.05, z: 7 }

it.each(['blue', 'wood', undefined])('导入主题 %s 保留已有存档选择，缺省使用木地板', theme => {
  const scene = JSON.parse(exportScene())
  if (theme === undefined) delete scene.theme
  else scene.theme = theme
  expect(importScene(JSON.stringify(scene))).toBeNull()
  expect(useSceneStore.getState().theme).toBe(theme ?? 'wood')
})

// 独立搭建渲染关节，检查球与实际双手的接触，不复用反解公式。
function actualHand(pose: Pose, side: 'L' | 'R', yaw: number) {
  const root = new THREE.Group()
  root.position.set(pos.x, pose.rootY + RIG.hipY + RIG.torsoY, pos.z)
  root.rotation.y = yaw
  const torso = new THREE.Group(); torso.rotation.x = pose.torso; root.add(torso)
  const shoulder = new THREE.Group()
  shoulder.position.set((side === 'L' ? 1 : -1) * RIG.shoulderX, RIG.shoulderY, 0)
  shoulder.rotation.set(-(side === 'L' ? pose.shoulderLX : pose.shoulderRX), 0, side === 'L' ? pose.shoulderLZ : pose.shoulderRZ)
  torso.add(shoulder)
  const elbow = new THREE.Group(); elbow.position.y = -RIG.upperArm
  elbow.rotation.x = -(side === 'L' ? pose.elbowL : pose.elbowR); shoulder.add(elbow)
  const palm = new THREE.Object3D(); palm.position.y = -RIG.forearm; elbow.add(palm)
  root.updateMatrixWorld(true)
  return palm.getWorldPosition(new THREE.Vector3())
}

describe('二传来球、双手与出手连续衔接', () => {
  it.each(['front', 'back'] as SetDirection[])('%s 在全部可调高度下从双手之间出手', direction => {
    for (const height of [1.8, 2.2, 2.6]) {
      for (const t of [0.3, 0.4, 0.5, 0.6]) {
        const pose = sampleSetterPose(t, height, direction, createScratchPose())
        const ball = sampleSetterBall(pos, target, height, direction, t)
        const center = new THREE.Vector3(ball.x, ball.y, ball.z)
        for (const side of ['L', 'R'] as const) {
          expect(center.distanceTo(actualHand(pose, side, setterYaw(pos, target, direction))))
            .toBeCloseTo(BALL_RADIUS + RIG.handRadius, 8)
        }
      }
      const start = setterRelease(pos, target, height, direction)
      const pass = solveByTime(start, { ...target, y: 2.85 }, 0.9)
      expect(pass.status).toBe('ok')
      const before = sampleSetterBall(pos, target, height, direction, 0.6 - 1e-6)
      expect(Math.hypot(start.x - before.x, start.y - before.y, start.z - before.z)).toBeLessThan(1e-8)
    }
  })
  it('背传人物正面与目标方向相反，球从头顶送向身后', () => {
    const yaw = setterYaw(pos, target, 'back')
    expect(Math.sin(yaw) * (target.x - pos.x) + Math.cos(yaw) * (target.z - pos.z)).toBeLessThan(0)
    const release = setterRelease(pos, target, 2.2, 'back')
    expect((release.x - pos.x) * Math.sin(yaw) + (release.z - pos.z) * Math.cos(yaw)).toBeLessThan(0)
  })
  it('来球始终可见且连续移动，接球交界没有跳变', () => {
    for (const direction of ['front', 'back'] as const) {
      let prev = sampleSetterBall(pos, target, 2.2, direction, 0)
      for (let i = 1; i <= 600; i++) {
        const ball = sampleSetterBall(pos, target, 2.2, direction, i / 1000)
        expect(Math.hypot(ball.x - prev.x, ball.y - prev.y, ball.z - prev.z)).toBeLessThan(0.007)
        prev = ball
      }
    }
  })
})

function qualityFor(stand: Vec2, end: Vec2, zone: ZoneId, height = 2.85) {
  const pass = solveByTime({ ...pos, y: 2.2 }, { ...end, y: height }, 1.3)
  if (pass.status !== 'ok') throw new Error(pass.message)
  return evaluateQuality({ pass: pass.traj, attack: null, setterPos: pos,
    attacker: { pos: stand, role: 'OH', rotationZone: zone }, styleId: null })
}
describe('步数、动画与质量检查共用实际助跑参数', () => {
  it.each([2, 3, 4] as const)('%s步正确迈脚，地面速度不倒退且峰值受控', steps => {
    const plan = planAttacker({ x: 3.3, z: 7.65 }, target, 2.85, 1.3, steps, 4)
    const expected = steps === 2 ? ['R', 'L'] : steps === 3 ? ['L', 'R', 'L'] : ['R', 'L', 'R', 'L']
    expect(footSequence(steps)).toEqual(expected)
    expect(plan.peakSpeed).toBeLessThanOrEqual(4.501)
    let before = 0
    for (let i = 0; i <= 100; i++) {
      const move = groundMove(i / 100, plan.distance, plan.runT, plan.airSpeed)
      expect(move).toBeGreaterThanOrEqual(before - 1e-8); before = move
    }
    const ends = stepEnds(steps)
    for (let i = 0; i < steps; i++) {
      const mid = ((i ? ends[i - 1] : 0) + ends[i]) / 2
      const pose = createScratchPose()
      sampleAttacker(plan, plan.startT + plan.runT * mid, pose, { x: 0, z: 0, yaw: 0 })
      expect(expected[i] === 'L' ? pose.hipL - pose.hipR : pose.hipR - pose.hipL).toBeGreaterThan(0)
    }
  })
  it('质量检查显示实际地面距离和速度，长助跑明确失败', () => {
    const report = qualityFor({ x: 8.5, z: 4.5 }, target, 4)
    expect(report.items.find(i => i.key === 'approach')?.value).toContain(report.approach.distance.toFixed(2))
    expect(report.items.find(i => i.key === 'runSpeed')?.value).toContain(report.approach.peakSpeed.toFixed(2))
    expect(report.items.find(i => i.key === 'timing')?.level).toBe('bad')
    expect(report.items.find(i => i.key === 'runSpeed')?.level).toBe('bad')
  })
  it('零距离退化不会产生 NaN 或倒退', () => {
    const reference = planAttacker(target, target, 2.85, 1.3)
    const plan = planAttacker(reference.contactRoot, target, 2.85, 1.3)
    expect(plan.distance).toBeCloseTo(0)
    expect(plan.peakSpeed).toBe(0)
  })
})

describe('前后排身份与实际起跳脚判定', () => {
  it.each([2, 3, 4] as const)('%s号位退到后场助跑仍是前排', zone => {
    const report = qualityFor({ x: 5, z: 7 }, target, zone)
    expect(report.items.find(i => i.key === 'rule')?.value).toContain('前排')
    expect(report.items.find(i => i.key === 'rule')?.level).toBe('ok')
  })
  it.each([1, 5, 6] as const)('%s号位移到前场也仍是后排，前场起跳高球违例', zone => {
    const report = qualityFor({ x: 2.5, z: 7 }, target, zone)
    expect(report.items.find(i => i.key === 'rule')?.level).toBe('bad')
    expect(report.items.find(i => i.key === 'rule')?.value).toContain('后排')
  })
  it('后排在三米线后起跳，可以在前场击球', () => {
    const report = qualityFor({ x: 5.5, z: 7 }, { x: 2.65, z: 7 }, 5, 3)
    expect(report.approach.takeoffFootX).toBeGreaterThan(3)
    expect(report.items.find(i => i.key === 'rule')?.level).toBe('ok')
  })
  it('脚前缘恰好碰到三米线后缘也应判为踩线', () => {
    const stand = { x: 5.5, z: 7 }
    const end = { x: 2.65, z: 7 }
    const first = qualityFor(stand, end, 5, 3)
    const shift = 3 - first.approach.takeoffFootX
    const report = qualityFor({ ...stand, x: stand.x + shift }, { ...end, x: end.x + shift }, 5, 3)
    expect(report.approach.takeoffFootX).toBeCloseTo(3, 8)
    expect(report.items.find(i => i.key === 'rule')?.level).toBe('bad')
  })
  it('球心高于网但球面未整体高于网，后排前场处理球合法', () => {
    const report = qualityFor({ x: 2, z: 7 }, target, 5, 2.5)
    expect(report.items.find(i => i.key === 'rule')?.level).toBe('ok')
  })
  it('号位交换、拖动、导入导出不会把身份改成空间位置', () => {
    useSceneStore.getState().setPlayerZone('p2', 1)
    expect(useSceneStore.getState().players.find(p => p.id === 'p4')?.rotationZone).toBe(4)
    useSceneStore.getState().setPlayerPos('p2', { x: 1, z: 7 })
    expect(useSceneStore.getState().players.find(p => p.id === 'p2')?.rotationZone).toBe(1)
    useSceneStore.getState().setParams({ setDirection: 'back', approachSteps: 4 })
    const scene = exportScene()
    useSceneStore.getState().resetFormation()
    expect(importScene(scene)).toBeNull()
    expect(useSceneStore.getState().params.setDirection).toBe('back')
    expect(useSceneStore.getState().params.approachSteps).toBe(4)
    expect(useSceneStore.getState().players.find(p => p.id === 'p2')?.rotationZone).toBe(1)
  })
  it('旧存档补入默认本轮号位，主攻起点在后场仍补为4号位', () => {
    const players = DEFAULT_FORMATION.map(({ rotationZone: _zone, ...p }) => p)
    expect(importScene(JSON.stringify({ version: 1, players, params: DEFAULT_PARAMS }))).toBeNull()
    expect(useSceneStore.getState().players[1].rotationZone).toBe(4)
  })
})
