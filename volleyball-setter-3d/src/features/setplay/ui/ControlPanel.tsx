import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useSceneStore, exportScene, importScene } from '../../../store/sceneStore'
import { useUiStore } from '../../../store/uiStore'
import { useQuality, useSolution } from '../useSolution'
import { ROLE_NAMES, ZONE_NAMES, zoneOf } from '../../../logic/court'
import { RouteList } from './RouteList'
import { PlaybackBar } from './PlaybackBar'

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="slider-row">
      <span className="slider-label">
        {label}
        <b className="mono">{format ? format(value) : value.toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

/** 左侧控制面板：方案推荐 / 参数编辑 / 播放 / 视角与画质 / 球员 / 存档 */
export function ControlPanel() {
  const params = useSceneStore((s) => s.params)
  const setParams = useSceneStore((s) => s.setParams)
  const setTarget = useSceneStore((s) => s.setTarget)
  const players = useSceneStore((s) => s.players)
  const setterId = useSceneStore((s) => s.setterId)
  const attackerId = useSceneStore((s) => s.attackerId)
  const setSetter = useSceneStore((s) => s.setSetter)
  const setAttacker = useSceneStore((s) => s.setAttacker)
  const resetFormation = useSceneStore((s) => s.resetFormation)
  const quality = useSceneStore((s) => s.quality)
  const setQuality = useSceneStore((s) => s.setQuality)
  const theme = useSceneStore((s) => s.theme)
  const setTheme = useSceneStore((s) => s.setTheme)
  const showZones = useSceneStore((s) => s.showZones)
  const setShowZones = useSceneStore((s) => s.setShowZones)
  const cameraMode = useUiStore((s) => s.cameraMode)
  const setCameraMode = useUiStore((s) => s.setCameraMode)
  const setPreset = useUiStore((s) => s.setPreset)
  const showQuality = useUiStore((s) => s.showQuality)
  const setShowQuality = useUiStore((s) => s.setShowQuality)
  const approachDist = useSceneStore((s) => s.approachDist)
  const setApproachDist = useSceneStore((s) => s.setApproachDist)
  const selectedStyle = useSceneStore((s) => s.selectedStyle)

  const solution = useSolution()
  const qualityReport = useQuality()
  const fileRef = useRef<HTMLInputElement>(null)

  // 按风格的建议助跑距离
  const APPROACH_SUGGEST: Record<string, string> = {
    t1: '快球两步助跑 1.2–1.6m',
    t2: '半高三步助跑 1.6–2.2m',
    t3: '高球三/四步助跑 2.0–3.0m',
    neg: '远网调整攻 1.8–2.6m',
    back: '背后进攻斜线助跑 1.4–2.0m',
  }
  const approachSuggest = APPROACH_SUGGEST[selectedStyle ?? ''] ?? '三步助跑 2.0–2.6m'

  const traj = solution.status === 'ok' ? solution.traj : null

  const onExport = (): void => {
    const blob = new Blob([exportScene()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'volleyball-scene.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    const err = importScene(await file.text())
    if (err) window.alert(`导入失败：${err}`)
    e.target.value = ''
  }

  return (
    <div className="panel-inner">
      <header className="panel-head">
        <h1>排球二传战术板</h1>
        <p>3D 传球路线设计 · 第一版</p>
      </header>

      <section className="sec">
        <h3>推荐方案（按风格）</h3>
        <RouteList />
      </section>

      <section className="sec">
        <h3>传球参数</h3>
        <div className="seg">
          <button className={`btn${params.mode === 'apex' ? ' active' : ''}`} onClick={() => setParams({ mode: 'apex' })}>
            按弧顶
          </button>
          <button className={`btn${params.mode === 'time' ? ' active' : ''}`} onClick={() => setParams({ mode: 'time' })}>
            按时间
          </button>
          <button className={`btn${params.mode === 'speed' ? ' active' : ''}`} onClick={() => setParams({ mode: 'speed' })}>
            按球速
          </button>
        </div>

        {params.mode === 'apex' && (
          <SliderRow label="弧顶高度" value={params.apexH} min={2.5} max={5.5} step={0.05} onChange={(v) => setParams({ apexH: v })} format={(v) => `${v.toFixed(2)} m`} />
        )}
        {params.mode === 'time' && (
          <SliderRow label="飞行时间" value={params.flightT} min={0.25} max={2.5} step={0.01} onChange={(v) => setParams({ flightT: v })} format={(v) => `${v.toFixed(2)} s`} />
        )}
        {params.mode === 'speed' && (
          <>
            <SliderRow label="出手球速" value={params.speed} min={4} max={14} step={0.1} onChange={(v) => setParams({ speed: v })} format={(v) => `${v.toFixed(1)} m/s`} />
            <div className="seg">
              <button className={`btn${params.arc === 'low' ? ' active' : ''}`} onClick={() => setParams({ arc: 'low' })}>
                低弧
              </button>
              <button className={`btn${params.arc === 'high' ? ' active' : ''}`} onClick={() => setParams({ arc: 'high' })}>
                高弧
              </button>
            </div>
          </>
        )}
        <SliderRow label="击球高度" value={params.contactH} min={2.0} max={3.4} step={0.01} onChange={(v) => setParams({ contactH: v })} format={(v) => `${v.toFixed(2)} m`} />
        <div className="grid4">
          {([
            ['快攻', 2.55],
            ['标准', 2.8],
            ['超手', 3.05],
            ['后排', 3.25],
          ] as const).map(([name, v]) => (
            <button
              key={name}
              className={`btn${Math.abs(params.contactH - v) < 0.005 ? ' active' : ''}`}
              onClick={() => setParams({ contactH: v })}
              title={`击球高度 ${v.toFixed(2)}m`}
            >
              {name}
            </button>
          ))}
        </div>
        <SliderRow label="出手高度" value={params.releaseH} min={1.8} max={2.6} step={0.01} onChange={(v) => setParams({ releaseH: v })} format={(v) => `${v.toFixed(2)} m`} />

        <div className="target-row">
          <span className="slider-label">目标位置（也可拖拽场上圆环）</span>
          <div className="target-inputs">
            <label>
              离网
              <input
                type="number"
                min={0.25}
                max={8.75}
                step={0.05}
                value={params.target.x}
                onChange={(e) => setTarget({ x: Number(e.target.value) || 0.25, z: params.target.z })}
              />
              m
            </label>
            <label>
              纵向
              <input
                type="number"
                min={0.25}
                max={8.75}
                step={0.05}
                value={params.target.z}
                onChange={(e) => setTarget({ x: params.target.x, z: Number(e.target.value) || 0.25 })}
              />
              m
            </label>
          </div>
        </div>

        <SliderRow
          label="攻手助跑距离"
          value={approachDist}
          min={0.6}
          max={4}
          step={0.05}
          onChange={(v) => setApproachDist(v)}
          format={(v) => `${v.toFixed(2)} m`}
        />
        <div className="hint-text">
          建议：{approachSuggest} · 当前约 {Math.max(1, Math.round(approachDist / 0.75))} 步
        </div>

        {solution.status === 'error' ? (
          <div className="err-banner">{solution.message}</div>
        ) : traj ? (
          <div className="readouts">
            <div className="ro">
              <span className="ro-label">飞行时间</span>
              <span className="ro-value mono">{traj.flightT.toFixed(2)} s</span>
            </div>
            <div className="ro">
              <span className="ro-label">出手球速</span>
              <span className="ro-value mono">{traj.speed.toFixed(1)} m/s</span>
            </div>
            <div className="ro">
              <span className="ro-label">出手仰角</span>
              <span className="ro-value mono">{traj.elevDeg.toFixed(0)}°</span>
            </div>
            <div className="ro">
              <span className="ro-label">方向角(0°朝网)</span>
              <span className="ro-value mono">{traj.dirDeg.toFixed(0)}°</span>
            </div>
            <div className="ro">
              <span className="ro-label">弧顶高度</span>
              <span className="ro-value mono">{traj.apexY.toFixed(2)} m</span>
            </div>
            <div className="ro">
              <span className="ro-label">目标离网</span>
              <span className="ro-value mono">{params.target.x.toFixed(2)} m</span>
            </div>
            <div className="ro wide">
              <span className="ro-label">过网余量</span>
              <span className={`ro-value mono${traj.netClearance === null ? '' : traj.netClearance >= 0.2 ? ' ok' : ' bad'}`}>
                {traj.netClearance === null
                  ? '球路不穿网'
                  : `+${traj.netClearance.toFixed(2)} m${traj.netClearance >= 0.2 ? '' : ' ⚠ 可能触网'}`}
              </span>
            </div>
            <div className="ro wide">
              <span className="ro-label">目标区域</span>
              <span className="ro-value">{ZONE_NAMES[zoneOf(params.target.x, params.target.z)]}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sec">
        <h3>传球质量检查</h3>
        {qualityReport ? (
          <>
            <div className={`q-score q-score-${qualityReport.level}`}>
              {qualityReport.score} 分 ·
              {{ ok: '质量良好', warn: '需注意', bad: '存在风险' }[qualityReport.level]}
            </div>
            {qualityReport.items.map((it) => (
              <div key={it.key} className={`q-row q-${it.level}`}>
                <span className="q-ico">{it.level === 'ok' ? '✓' : it.level === 'warn' ? '⚠' : '✗'}</span>
                <div className="q-main">
                  <div className="q-l1">
                    <span className="q-name">{it.label}</span>
                    <span className="q-val mono">{it.value}</span>
                  </div>
                  <div className="q-l2">
                    {it.band} · {it.hint}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="hint-text">当前参数无可行解，请调整弧顶/球速/目标位置。</div>
        )}
        <label className="check-row">
          <input type="checkbox" checked={showQuality} onChange={(e) => setShowQuality(e.target.checked)} />
          场景内显示质量图例（距离尺/高度尺等）
        </label>
      </section>

      <section className="sec">
        <h3>动画播放</h3>
        <PlaybackBar />
      </section>

      <section className="sec">
        <h3>视角与画质</h3>
        <div className="grid4">
          <button className="btn" onClick={() => setPreset('coach')}>全景</button>
          <button className="btn" onClick={() => setPreset('baseline')}>底线</button>
          <button className="btn" onClick={() => setPreset('side')}>边线</button>
          <button className="btn" onClick={() => setPreset('top')}>俯视</button>
        </div>
        <button
          className={`btn wide-btn${cameraMode === 'pov' ? ' active' : ''}`}
          onClick={() => setCameraMode(cameraMode === 'pov' ? 'orbit' : 'pov')}
        >
          {cameraMode === 'pov' ? '退出二传视角' : '🎯 进入二传第一人称'}
        </button>
        <div className="grid2">
          <div className="seg">
            <button className={`btn${quality === 'high' ? ' active' : ''}`} onClick={() => setQuality('high')}>
              高画质
            </button>
            <button className={`btn${quality === 'fast' ? ' active' : ''}`} onClick={() => setQuality('fast')}>
              流畅
            </button>
          </div>
          <div className="seg">
            <button className={`btn${theme === 'blue' ? ' active' : ''}`} onClick={() => setTheme('blue')}>
              蓝地胶
            </button>
            <button className={`btn${theme === 'wood' ? ' active' : ''}`} onClick={() => setTheme('wood')}>
              木地板
            </button>
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
          显示号位标注
        </label>
      </section>

      <section className="sec">
        <h3>球员与阵型</h3>
        <div className="grid2">
          <label className="select-row">
            二传
            <select value={setterId} onChange={(e) => setSetter(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {ROLE_NAMES[p.role]}
                </option>
              ))}
            </select>
          </label>
          <label className="select-row">
            攻手
            <select value={attackerId} onChange={(e) => setAttacker(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {ROLE_NAMES[p.role]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint-text">场上可直接拖拽球员调整布阵；黄色环为二传、蓝色环为当前攻手。</p>
        <button className="btn wide-btn" onClick={resetFormation}>
          重置默认站位
        </button>
      </section>

      <section className="sec">
        <h3>存档</h3>
        <div className="grid2">
          <button className="btn" onClick={onExport}>
            导出 JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            导入 JSON
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void onImportFile(e)} />
      </section>
    </div>
  )
}
