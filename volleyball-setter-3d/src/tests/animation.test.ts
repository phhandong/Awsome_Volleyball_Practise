import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { advancePlayback, cycleLength, playback, sampleBall } from '../features/setplay/animation'
import { AIR_SPEED, BALL_RADIUS, planAttacker, RIG, sampleAttacker, type AttackerFrame } from '../features/setplay/scene/attackerMotion'
import { createScratchPose, type Pose } from '../features/setplay/scene/poses'
import { computeAttackRoute, sampleAt, solveByApex, solveByTime } from '../logic/trajectory'
import { generateRoutes } from '../logic/presets'
import { DEFAULT_FORMATION } from '../logic/court'
import type { Vec2 } from '../types'

const savedPlayback = { ...playback }
afterEach(() => Object.assign(playback, savedPlayback))

function frameAt(plan: ReturnType<typeof planAttacker>, t: number) {
  const pose = createScratchPose()
  const frame: AttackerFrame = { x: 0, z: 0, yaw: 0 }
  sampleAttacker(plan, t, pose, frame)
  return { pose, frame }
}

// 使用实际渲染关节的父子层级求世界坐标，避免只检验定位公式自身。
function renderedHand(pose: Pose, frame: AttackerFrame): THREE.Vector3 {
  const root = new THREE.Group()
  root.position.set(frame.x, 0, frame.z)
  const facing = new THREE.Group()
  facing.rotation.y = frame.yaw
  root.add(facing)
  const body = new THREE.Group()
  body.position.y = pose.rootY
  facing.add(body)
  const hips = new THREE.Group()
  hips.position.y = RIG.hipY
  body.add(hips)
  const torso = new THREE.Group()
  torso.position.y = RIG.torsoY
  torso.rotation.x = pose.torso
  hips.add(torso)
  const shoulder = new THREE.Group()
  shoulder.position.set(-RIG.shoulderX, RIG.shoulderY, 0)
  shoulder.rotation.set(-pose.shoulderRX, 0, pose.shoulderRZ)
  torso.add(shoulder)
  const elbow = new THREE.Group()
  elbow.position.y = -RIG.upperArm
  elbow.rotation.x = -pose.elbowR
  shoulder.add(elbow)
  const hand = new THREE.Object3D()
  hand.position.y = -RIG.forearm
  elbow.add(hand)
  root.updateMatrixWorld(true)
  return hand.getWorldPosition(new THREE.Vector3())
}

function checkContact(stand: Vec2, target: Vec2, contactH: number, apexH: number) {
  const pass = solveByApex({ x: 0.7, y: 2.2, z: 1.6 }, { ...target, y: contactH }, apexH)
  expect(pass.status).toBe('ok')
  if (pass.status !== 'ok') return
  const attack = computeAttackRoute(pass.traj).traj
  const plan = planAttacker(stand, target, contactH, pass.traj.flightT)
  const { pose, frame } = frameAt(plan, plan.contactT)
  const hand = renderedHand(pose, frame)
  const ball = sampleBall(pass.traj, attack, plan.contactT)
  const center = new THREE.Vector3(ball.x, ball.y, ball.z)
  expect(ball.x).toBeCloseTo(target.x, 10)
  expect(ball.y).toBeCloseTo(contactH, 10)
  expect(ball.z).toBeCloseTo(target.z, 10)
  expect(center.distanceTo(hand)).toBeCloseTo(BALL_RADIUS + RIG.handRadius, 10)
  expect(hand.y).toBeCloseTo(ball.y, 10)
  expect(hand.x).toBeGreaterThan(ball.x) // 球在面向球网的手掌前方
  expect(hand.z).toBeCloseTo(ball.z, 10)
  const before = sampleBall(pass.traj, attack, plan.contactT - 1e-6)
  const after = sampleBall(pass.traj, attack, plan.contactT + 1e-6)
  expect(center.distanceTo(new THREE.Vector3(before.x, before.y, before.z))).toBeLessThan(0.0001)
  expect(center.distanceTo(new THREE.Vector3(after.x, after.y, after.z))).toBeLessThan(0.0001)
}

describe('攻手助跑与触球', () => {
  it('默认站位与所有推荐风格在传球、扣球交界处真正触球', () => {
    checkContact(DEFAULT_FORMATION[1].pos, { x: 0.95, z: 7 }, 2.85, 3.4)
    for (const routes of Object.values(generateRoutes(DEFAULT_FORMATION[0], DEFAULT_FORMATION[1]))) {
      for (const route of routes) checkContact(route.stand, route.params.target, route.params.contactH, route.params.apexH)
    }
  })

  it.each([2, 2.55, 2.85, 3.25, 3.4])('击球高度 %sm 时右手均接触球面', (height) => {
    checkContact({ x: 5.2, z: 5.8 }, { x: 3.6, z: 4.5 }, height, Math.max(3.6, height + 0.2))
  })

  it.each([
    [{ x: 3.3, z: 7.65 }, { x: 0.95, z: 7 }],
    [{ x: 3.2, z: 0.4 }, { x: 1, z: 2 }],
    [{ x: 1, z: 1 }, { x: 4, z: 4.5 }],
    [{ x: 0.25, z: 8.75 }, { x: 8.75, z: 0.25 }],
  ])('转体过程中助跑始终沿站位到起跳点，不会旋转位移', (stand, target) => {
    const plan = planAttacker(stand, target, 2.85, 1)
    const dx = plan.contactRoot.x - stand.x
    const dz = plan.contactRoot.z - stand.z
    let prevDist = Infinity
    for (let i = 0; i <= 30; i++) {
      const { frame } = frameAt(plan, plan.contactT * i / 30)
      expect((frame.x - stand.x) * dz - (frame.z - stand.z) * dx).toBeCloseTo(0, 10)
      const remaining = Math.hypot(frame.x - plan.contactRoot.x, frame.z - plan.contactRoot.z)
      expect(remaining).toBeLessThanOrEqual(prevDist + 1e-10)
      prevDist = remaining
    }
    expect(prevDist).toBeCloseTo(0, 10)
  })

  it('触球后连续下落，无瞬间落地', () => {
    const plan = planAttacker({ x: 3.3, z: 7.65 }, { x: 0.95, z: 7 }, 2.85, 0.83)
    const strike = frameAt(plan, plan.contactT)
    const after = frameAt(plan, plan.contactT + 1e-6)
    expect(after.pose.rootY).toBeCloseTo(strike.pose.rootY, 6)
    expect(after.pose.rootY).toBeGreaterThan(0.5)
    expect(frameAt(plan, plan.contactT - 1e-6).pose.rootY).toBeCloseTo(strike.pose.rootY, 6)
    expect(frameAt(plan, plan.contactT + plan.fallT).pose.rootY).toBeCloseTo(0, 10)
  })

  it('快球可在出手前开始助跑，高球可延后起动', () => {
    const stand = { x: 2.2, z: 2 }
    const target = { x: 1, z: 1.8 }
    const fast = planAttacker(stand, target, 2.62, 0.25)
    const high = planAttacker(stand, target, 2.9, 2)
    expect(fast.startT).toBeLessThan(playback.hold)
    expect(high.startT).toBeGreaterThan(playback.hold)
    expect(frameAt(fast, fast.takeoffT).frame.x).toBeCloseTo(fast.takeoffRoot.x)
  })

  it('向后拖动、重复采样与重播都产生相同位置和姿态', () => {
    const plan = planAttacker({ x: 3.3, z: 7.65 }, { x: 0.95, z: 7 }, 2.85, 0.83)
    const expected = frameAt(plan, plan.contactT)
    const pose = createScratchPose()
    const frame = { x: 0, z: 0, yaw: 0 }
    for (const t of [plan.contactT + 0.2, 0, 0.7, plan.contactT]) sampleAttacker(plan, t, pose, frame)
    expect({ pose, frame }).toEqual(expected)
  })
})

describe('腾空水平速度', () => {
  const front = () => planAttacker({ x: 3.3, z: 7.65 }, { x: 0.95, z: 7 }, 2.85, 0.83)
  const back = () => planAttacker({ x: 5.5, z: 4.6 }, { x: 3.8, z: 4.5 }, 3, 1.3, 3, 6)
  const velocityAt = (plan: ReturnType<typeof planAttacker>, t: number) => {
    const dt = 1e-5
    const a = frameAt(plan, t - dt).frame
    const b = frameAt(plan, t + dt).frame
    return { x: (b.x - a.x) / (2 * dt), z: (b.z - a.z) / (2 * dt) }
  }

  it('前排离地速度 1.3m/s，后排双脚起跳 2.2m/s', () => {
    expect(front().airSpeed).toBe(AIR_SPEED.front)
    expect(back().airSpeed).toBe(AIR_SPEED.back)
  })

  it('从离地到触球再到落地，水平速度非零且恒定，转体不改变飞行方向', () => {
    for (const plan of [front(), back()]) {
      for (const u of [0.01, 0.25, 0.5, 0.75, 0.99]) {
        const v = velocityAt(plan, plan.takeoffT + (plan.landingT - plan.takeoffT) * u)
        expect(v.x).toBeCloseTo(plan.airVelocity.x, 7)
        expect(v.z).toBeCloseTo(plan.airVelocity.z, 7)
        expect(Math.hypot(v.x, v.z)).toBeCloseTo(plan.airSpeed, 7)
      }
      const takeoff = frameAt(plan, plan.takeoffT).frame
      const contact = frameAt(plan, plan.contactT).frame
      const landing = frameAt(plan, plan.landingT).frame
      expect(Math.hypot(contact.x - takeoff.x, contact.z - takeoff.z)).toBeCloseTo(plan.airSpeed * plan.riseT, 10)
      expect(Math.hypot(landing.x - contact.x, landing.z - contact.z)).toBeCloseTo(plan.airSpeed * plan.fallT, 10)
      expect(contact.x).toBeCloseTo(plan.contactRoot.x, 10)
      expect(contact.z).toBeCloseTo(plan.contactRoot.z, 10)
    }
  })

  it('起跳和落地交界处水平速度连续，落地后制动才减速到零', () => {
    const plan = front()
    for (const t of [plan.takeoffT, plan.landingT]) {
      const v = velocityAt(plan, t)
      expect(v.x).toBeCloseTo(plan.airVelocity.x, 3)
      expect(v.z).toBeCloseTo(plan.airVelocity.z, 3)
    }
    const halfway = velocityAt(plan, plan.landingT + plan.brakeT / 2)
    expect(Math.hypot(halfway.x, halfway.z)).toBeCloseTo(plan.airSpeed / 2, 7)
    const stopped = velocityAt(plan, plan.landingT + plan.brakeT + 0.01)
    expect(stopped).toEqual({ x: 0, z: 0 })
  })

  it('上升和下降采用重力抛物线，触球位于顶点', () => {
    const plan = front()
    expect(plan.riseT).toBeCloseTo(plan.fallT, 10)
    expect(plan.jumpH).toBeCloseTo(0.5 * 9.81 * plan.riseT ** 2, 10)
    for (const u of [0.25, 0.5, 0.75]) {
      const up = frameAt(plan, plan.takeoffT + plan.riseT * u).pose.rootY
      const down = frameAt(plan, plan.landingT - plan.fallT * u).pose.rootY
      expect(up).toBeCloseTo(down, 10)
    }
    expect(frameAt(plan, plan.contactT).pose.rootY).toBeCloseTo(plan.jumpH, 10)
  })

  it('贴网高球在起跳前降低速度，腾空仍匀速，落地制动后不会越过球网', () => {
    const plan = planAttacker({ x: 3, z: 7.5 }, { x: 0.25, z: 7 }, 3.4, 1.3)
    expect(plan.airSpeed).toBeGreaterThan(0)
    expect(plan.airSpeed).toBeLessThan(AIR_SPEED.front)
    expect(frameAt(plan, plan.landingT + plan.brakeT).frame.x).toBeGreaterThanOrEqual(0.25 - 1e-10)
    expect(Math.hypot(...Object.values(velocityAt(plan, plan.contactT)))).toBeCloseTo(plan.airSpeed, 7)
    checkContact(plan.stand, { x: 0.25, z: 7 }, 3.4, 4)
  })
})

describe('共享播放时钟', () => {
  it.each([0.25, 0.5, 1, 2])('%s倍速与不同帧率采样同一时间时人物和球一致', (speed) => {
    const pass = solveByTime({ x: 0.7, y: 2.2, z: 1.6 }, { x: 0.95, y: 2.85, z: 7 }, 0.83)
    if (pass.status !== 'ok') throw new Error('无效测试路线')
    const attack = computeAttackRoute(pass.traj).traj
    const plan = planAttacker({ x: 3.3, z: 7.65 }, pass.traj.end, 2.85, 0.83)
    for (const fps of [30, 60, 144]) {
      playback.t = 0
      playback.playing = true
      playback.speed = speed
      const frames = Math.ceil(plan.contactT * fps / speed)
      const dt = plan.contactT / frames / speed
      for (let i = 0; i < frames; i++) advancePlayback(dt, pass.traj.flightT, attack.flightT)
      expect(playback.t).toBeCloseTo(plan.contactT, 10)
      const { frame, pose } = frameAt(plan, playback.t)
      const p = sampleBall(pass.traj, attack, playback.t)
      expect(renderedHand(pose, frame).distanceTo(new THREE.Vector3(p.x, p.y, p.z)))
        .toBeCloseTo(BALL_RADIUS + RIG.handRadius, 8)
      expect(p.y).toBeCloseTo(sampleAt(pass.traj, pass.traj.flightT).y, 8)
    }
  })

  it('暂停不推进时钟，跨循环保留余时', () => {
    playback.t = 1
    playback.playing = false
    advancePlayback(0.2, 0.83, 0.6)
    expect(playback.t).toBe(1)
    playback.t = cycleLength(0.83, 0.6) - 0.01
    playback.playing = true
    playback.speed = 2
    advancePlayback(0.02, 0.83, 0.6)
    expect(playback.t).toBeCloseTo(0.03, 10)
  })
})
