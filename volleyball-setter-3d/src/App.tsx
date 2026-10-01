import { useEffect } from 'react'
import { Scene3D } from './features/setplay/Scene3D'
import { ControlPanel } from './features/setplay/ui/ControlPanel'
import { PovHud } from './features/setplay/ui/PovHud'
import { useUiStore } from './store/uiStore'

function App() {
  const setCameraMode = useUiStore((s) => s.setCameraMode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCameraMode('orbit')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCameraMode])

  return (
    <div className="app">
      <aside className="panel">
        <ControlPanel />
      </aside>
      <main className="stage">
        <Scene3D />
        <PovHud />
        <div className="stage-hint">
          左键拖动旋转 · 滚轮缩放 · 右键平移 · 拖拽球员与黄色目标环调整站位
        </div>
      </main>
    </div>
  )
}

export default App
