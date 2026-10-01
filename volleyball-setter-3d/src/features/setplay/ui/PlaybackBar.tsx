import { useEffect, useState } from 'react'
import { cycleLength, playback, resetPlayback } from '../animation'
import { useAttackRoute, useSolution } from '../useSolution'

/** 唯一播放控件，常驻球场下方，不随参数面板关闭而卸载。 */
export function PlaybackBar() {
  const solution = useSolution()
  const { attackT } = useAttackRoute(solution)
  const T = solution.status === 'ok' ? solution.traj.flightT : 1
  const cycle = cycleLength(T, attackT)
  const [t, setT] = useState(playback.t)
  const [playing, setPlaying] = useState(playback.playing)
  const [speed, setSpeed] = useState(playback.speed)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      setT(playback.t)
      setPlaying(playback.playing)
      setSpeed(playback.speed)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const seek = (time: number): void => {
    playback.playing = false
    playback.t = time
    setPlaying(false)
    setT(time)
  }

  return (
    <div className="playback">
      <div className="playback-actions">
        <button className={`btn icon-btn${playing ? ' active' : ''}`} aria-label={playing ? '暂停' : '播放'}
          title={playing ? '暂停' : '播放'} onClick={() => {
            playback.playing = !playback.playing
            if (playback.playing && playback.t >= cycle) resetPlayback()
            setPlaying(playback.playing)
          }}>{playing ? '⏸' : '▶'}</button>
        <button className="btn icon-btn" aria-label="回到开头" title="回到开头" onClick={() => {
          resetPlayback()
          setT(0)
        }}>⏮</button>
        <button className="btn" title="暂停并查看二传双手出手瞬间" onClick={() => seek(playback.hold)}>二传出手</button>
        <button className="btn" disabled={solution.status !== 'ok'} title="暂停并查看攻手触球瞬间"
          onClick={() => seek(playback.hold + T)}>击球瞬间</button>
      </div>
      <div className="playback-seek">
        <input type="range" aria-label="播放进度" min={0} max={cycle} step={0.01} value={Math.min(t, cycle)}
          onPointerDown={() => { playback.playing = false; setPlaying(false) }}
          onChange={(e) => seek(Number(e.target.value))} />
      </div>
      <div className="playback-meta">
        <span className="mono playback-time">{t.toFixed(2)}s / {cycle.toFixed(2)}s</span>
        <div className="seg playback-speeds" role="group" aria-label="播放速度">
          {[0.25, 0.5, 1, 2].map((v) => (
            <button key={v} className={`btn${speed === v ? ' active' : ''}`} aria-pressed={speed === v}
              onClick={() => { playback.speed = v; setSpeed(v) }}>{v}×</button>
          ))}
        </div>
      </div>
    </div>
  )
}
