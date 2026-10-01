import { useMemo } from 'react'
import { useSceneStore } from '../../../store/sceneStore'
import { generateRoutes, STYLES } from '../../../logic/presets'
import { ZONE_NAMES, zoneOf } from '../../../logic/court'

/** 五风格推荐方案列表：每风格展示 Top3，点击即套用预览 */
export function RouteList() {
  const players = useSceneStore((s) => s.players)
  const setterId = useSceneStore((s) => s.setterId)
  const attackerId = useSceneStore((s) => s.attackerId)
  const selectedId = useSceneStore((s) => s.selectedCandidateId)
  const applyCandidate = useSceneStore((s) => s.applyCandidate)

  const routes = useMemo(() => {
    const setter = players.find((p) => p.id === setterId)
    const attacker = players.find((p) => p.id === attackerId)
    if (!setter || !attacker) return null
    return generateRoutes(setter, attacker)
  }, [players, setterId, attackerId])

  if (!routes) return null

  return (
    <div className="route-list">
      {STYLES.map((style) => {
        const list = routes[style.id]
        return (
          <div key={style.id} className="style-group">
            <div className="style-head">
              <span className="style-dot" style={{ background: style.color }} />
              <span className="style-name">{style.name}</span>
              <span className="style-desc">{style.desc}</span>
            </div>
            {list.length === 0 && <div className="route-empty">暂无可行方案</div>}
            {list.map((c) => (
              <button
                key={c.id}
                className={`route-card${selectedId === c.id ? ' selected' : ''}`}
                onClick={() => applyCandidate(c)}
              >
                <span className="route-top">
                  <span className="route-name">{c.variantName}</span>
                  <span className="score-chip">{c.score}</span>
                </span>
                <span className="route-metrics">
                  {c.metrics.flightT.toFixed(2)}s · {c.metrics.speed.toFixed(1)}m/s · 弧顶{' '}
                  {c.metrics.apexY.toFixed(2)}m · 起点距目标{' '}
                  {Math.hypot(c.stand.x - c.params.target.x, c.stand.z - c.params.target.z).toFixed(1)}m ·{' '}
                  目标{ZONE_NAMES[zoneOf(c.params.target.x, c.params.target.z)]}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
