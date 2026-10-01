import { setterRelease } from '../../logic/setterMotion'
import { planAttacker } from '../../logic/approach'
import { useMemo } from 'react'
import { useSceneStore } from '../../store/sceneStore'
import { computeAttackRoute, solveByApex, solveBySpeed, solveByTime } from '../../logic/trajectory'
import { evaluateQuality, type QualityReport } from '../../logic/quality'
import type { SolveResult, Trajectory } from '../../types'

/**
 * 由当前二传位置 + 路线参数求解当前轨迹（UI 与 3D 共用的唯一入口）。
 * 注意：selector 必须返回 store 内的稳定引用（params/players 不可变更新），
 * 否则 useSyncExternalStore 会陷入无限重渲染。
 */
export function useSolution(): SolveResult {
  const params = useSceneStore((s) => s.params)
  const setter = useSceneStore((s) => s.players.find((p) => p.id === s.setterId))

  return useMemo(() => {
    const sp = setter ? setter.pos : { x: 0.7, z: 1.6 }
    const start = setterRelease(sp, params.target, params.releaseH, params.setDirection)
    const end = { x: params.target.x, y: params.contactH, z: params.target.z }
    switch (params.mode) {
      case 'apex':
        return solveByApex(start, end, params.apexH)
      case 'time':
        return solveByTime(start, end, params.flightT)
      case 'speed':
        return solveBySpeed(start, end, params.speed, params.arc)
    }
  }, [params, setter])
}

/** 攻手击飞轨迹（由传球终点派生） */
export function useAttackRoute(pass: SolveResult): { attack: Trajectory | null; attackT: number } {
  return useMemo(() => {
    if (pass.status !== 'ok') return { attack: null, attackT: 0.5 }
    const r = computeAttackRoute(pass.traj)
    return { attack: r.traj, attackT: r.T }
  }, [pass])
}

/** 传球质量报告（面板与 3D 图例共用同一次计算） */
export function useQuality(): QualityReport | null {
  const solution = useSolution()
  const { attack } = useAttackRoute(solution)
  const attacker = useSceneStore((s) => s.players.find((p) => p.id === s.attackerId))
  const setter = useSceneStore((s) => s.players.find((p) => p.id === s.setterId))
  const steps = useSceneStore((s) => s.params.approachSteps)
  const styleId = useSceneStore((s) => s.selectedStyle)

  return useMemo(() => {
    if (solution.status !== 'ok' || !attacker || !setter) return null
    return evaluateQuality({
      pass: solution.traj,
      attack,
      attacker: { pos: attacker.pos, role: attacker.role, rotationZone: attacker.rotationZone },
      approach: planAttacker(attacker.pos, solution.traj.end, solution.traj.end.y, solution.traj.flightT, steps, attacker.rotationZone),
      setterPos: setter.pos,
      styleId,
    })
  }, [solution, attack, attacker, setter, styleId, steps])
}
