import { useEffect, useRef } from 'react'
import { Scene3D } from './features/setplay/Scene3D'
import { ControlPanel } from './features/setplay/ui/ControlPanel'
import { PlaybackBar } from './features/setplay/ui/PlaybackBar'
import { PovHud } from './features/setplay/ui/PovHud'
import { useUiStore } from './store/uiStore'

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'

function App() {
  const cameraMode = useUiStore((s) => s.cameraMode)
  const compact = useUiStore((s) => s.compact)
  const panelOpen = useUiStore((s) => s.panelOpen)
  const setPanelOpen = useUiStore((s) => s.setPanelOpen)
  const setCompact = useUiStore((s) => s.setCompact)
  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasPanelOpen = useRef(panelOpen)
  const modal = compact && panelOpen

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)')
    const update = (): void => setCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [setCompact])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        useUiStore.getState().escape()
      }
      if (e.key !== 'Tab' || !modal) return
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .filter((el) => el.getClientRects().length > 0)
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  useEffect(() => {
    if (!modal) return
    const trigger = triggerRef.current
    closeRef.current?.focus()
    return () => { trigger?.focus() }
  }, [modal])

  useEffect(() => {
    if (wasPanelOpen.current && !panelOpen) triggerRef.current?.focus()
    wasPanelOpen.current = panelOpen
  }, [panelOpen])

  const closePanel = (): void => {
    setPanelOpen(false)
  }

  return (
    <div className={`app${compact ? ' compact' : ''}${panelOpen ? ' panel-open' : ''}`}>
      {modal && <button className="panel-backdrop" tabIndex={-1} aria-label="关闭参数面板遮罩" onClick={closePanel} />}
      <aside id="control-panel" className="panel" ref={panelRef} inert={!panelOpen}
        role={compact ? 'dialog' : undefined} aria-modal={modal || undefined}
        aria-labelledby="app-title" aria-hidden={!panelOpen}>
        <div className="panel-shell">
          <header className="panel-head">
            <img className="brand-logo" src={`${import.meta.env.BASE_URL}volleyball.svg?v=2`} width="38" height="38" alt="" aria-hidden="true" />
            <div className="brand-copy"><h1 id="app-title">排球进攻战术板</h1><p>3D 二传与攻手排练</p></div>
            <button ref={closeRef} className="btn panel-close" onClick={closePanel} aria-label={compact ? '关闭参数面板' : '收起参数面板'} title={compact ? '关闭参数面板' : '收起参数面板'}>‹</button>
          </header>
          <div className="panel-scroll"><ControlPanel /></div>
        </div>
      </aside>
      <main className={`stage${modal ? ' stage-blocked' : ''}`} inert={modal} aria-hidden={modal || undefined}>
        <nav className="stage-toolbar" aria-label="球场快捷操作">
          <button ref={triggerRef} className="btn panel-trigger" aria-controls="control-panel" aria-expanded={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}>☰ <span>{compact ? '参数' : '参数面板'}</span></button>
          <span className="stage-brand">3D 排练</span>
          <div className="stage-actions">
            <button className="btn" onClick={() => useUiStore.getState().setPreset('coach')}>全景</button>
            <button className={`btn${cameraMode === 'pov' ? ' active' : ''}`} onClick={() => useUiStore.getState().setCameraMode(cameraMode === 'pov' ? 'orbit' : 'pov')}>
              {cameraMode === 'pov' ? '退出二传视角' : '二传视角'}
            </button>
            {cameraMode === 'pov' && <button className="btn" onClick={() => useUiStore.getState().resetPov()}>回正看球</button>}
          </div>
        </nav>
        <div className="stage-viewport">
          <Scene3D />
          <PovHud />
          <div className="stage-hint">
            {cameraMode === 'pov'
              ? compact ? '单指拖动环视 · 点“回正看球”恢复视线' : '拖动环视 · F 回正看球 · Esc 退出二传视角'
              : compact ? '单指旋转 · 双指缩放 / 平移 · 拖动球员调整站位' : '左键旋转 · 滚轮缩放 · 右键平移 · 拖动球员与目标环调整站位'}
          </div>
        </div>
        <footer className="playback-dock" aria-label="动画播放控制"><PlaybackBar /></footer>
      </main>
    </div>
  )
}

export default App
