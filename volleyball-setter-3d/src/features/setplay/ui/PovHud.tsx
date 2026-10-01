import { useUiStore } from '../../../store/uiStore'
import { useSceneStore } from '../../../store/sceneStore'
import { useQuality, useSolution } from '../useSolution'
import { ZONE_NAMES, zoneOf } from '../../../logic/court'

/** 空间冲突常驻球场外层，折叠面板或关闭质量图例仍可见。 */
export function SpaceAlerts() {
  const report = useQuality()
  const conflicts = report?.items.filter(i => (i.key === 'setterSpace' || i.key === 'netSpace') && i.level === 'bad') ?? []
  if (!conflicts.length) return null
  return <div className="space-alert" role="status">{conflicts.map(i => <div key={i.key}><strong>{i.label}冲突：</strong>{i.hint}</div>)}</div>
}

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
        <div className="pov-title">二传第一人称</div>
        {traj ? (
          <>
            <div>飞行时间 {traj.flightT.toFixed(2)}s</div>
            <div>球速 {traj.speed.toFixed(1)} m/s · 仰角 {traj.elevDeg.toFixed(0)}°</div>
            <div>
              目标区域 {ZONE_NAMES[zoneOf(params.target.x, params.target.z)]} · 击球高 {params.contactH.toFixed(2)}m
            </div>
          </>
        ) : (
          <div className="err-text">{solution.status === 'error' ? solution.message : ''}</div>
        )}
      </div>
    </div>
  )
}
