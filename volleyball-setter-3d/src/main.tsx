import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useSceneStore } from './store/sceneStore.ts'

if (import.meta.env.DEV) {
  // 调试入口：控制台可读取/修改场景状态
  ;(window as unknown as Record<string, unknown>).__store = useSceneStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
