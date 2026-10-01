import { useEffect, useState } from 'react'
import { cycleLength, playback, resetPlayback } from '../animation'
import { useAttackRoute, useSolution } from '../useSolution'

/** 播放控制：播放/暂停、变速、进度拖动（scrub 时暂停） */
export function PlaybackBar() {
  const solution = useSolution()
  const { attackT } = useAttackRoute(solution)
  const T = solution.status === 'ok' ? solution.traj.flightT : 1
  const cycle = cycleLength(T, attackT)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(playback.playing)
  const [speed, setSpeed] = useState(playback.speed)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      setT(playback.t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="playback">
      <div className="playback-row">
        <button
          className="btn icon-btn"
          onClick={() => {
            playback.playing = !playback.playing
            if (playback.playing && playback.t >= cycle) resetPlayback()
            setPlaying(playback.playing)
          }}
          title={playing ? '暂停' : '播放'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="btn icon-btn"
          onClick={() => {
            resetPlayback()
            setT(0)
          }}
          title="回到开头"
        >
          ⏮
        </button>
        <button
          className="btn"
          disabled={solution.status !== 'ok'}
          title="暂停并查看攻手触球瞬间"
          onClick={() => {
            playback.playing = false
            playback.t = playback.hold + T
            setPlaying(false)
            setT(playback.t)
          }}
        >
          击球瞬间
        </button>
        <input
          type="range"
          min={0}
          max={cycle}
          step={0.01}
          value={Math.min(t, cycle)}
          onPointerDown={() => {
            playback.playing = false
            setPlaying(false)
          }}
          onChange={(e) => {
            playback.t = Number(e.target.value)
            setT(playback.t)
          }}
        />
      </div>
      <div className="playback-row small">
        <span className="mono">{t.toFixed(2)}s / {cycle.toFixed(2)}s</span>
        <div className="seg">
          {[0.25, 0.5, 1, 2].map((v) => (
            <button
              key={v}
              className={`btn${speed === v ? ' active' : ''}`}
              onClick={() => {
                playback.speed = v
                setSpeed(v)
              }}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
