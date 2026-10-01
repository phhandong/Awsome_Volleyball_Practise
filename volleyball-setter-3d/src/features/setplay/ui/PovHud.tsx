import { useUiStore } from '../../../store/uiStore'
import { useSceneStore } from '../../../store/sceneStore'
import { useSolution } from '../useSolution'
import { ZONE_NAMES, zoneOf } from '../../../logic/court'

/** 二传第一人称 HUD：准星 + 参数卡 + 操作提示 */
export function PovHud() {
  const pov = useUiStore((s) => s.cameraMode === 'pov')
  const solution = useSolution()
  const params = useSceneStore((s) => s.params)
  if (!pov) return null

  const traj = solution.status === 'ok' ? solution.traj : null

  return (
    <div className="pov-hud">
      <div className="pov-crosshair" />
      <div className="pov-card">
        <div className="pov-title">二传视角</div>
        {traj ? (
          <>
            <div>飞行时间 {traj.flightT.toFixed(2)}s</div>
            <div>球速 {traj.speed.toFixed(1)} m/s · 仰角 {traj.elevDeg.toFixed(0)}°</div>
            <div>
              目标 {ZONE_NAMES[zoneOf(params.target.x, params.target.z)]} · 击球高 {params.contactH.toFixed(2)}m
            </div>
          </>
        ) : (
          <div className="err-text">{solution.status === 'error' ? solution.message : ''}</div>
        )}
      </div>
      <div className="pov-hint">拖动环视 · F 回正看球 · Esc 退出</div>
    </div>
  )
}
