import { create } from 'zustand'

export type CameraMode = 'orbit' | 'pov'
export type PovLookMode = 'auto' | 'free'
export type ViewPreset = 'coach' | 'baseline' | 'side' | 'top'

interface UiState {
  compact: boolean
  panelOpen: boolean
  desktopPanelOpen: boolean
  povResetNonce: number
  povLookMode: PovLookMode
  cameraMode: CameraMode
  viewPreset: ViewPreset
  /** 重新触发同一预设的过渡动画 */
  viewNonce: number
  /** 正在拖拽 3D 物体时暂停轨道控制 */
  dragging: boolean
  /** 显示传球质量 3D 浮动图例 */
  showQuality: boolean

  setCameraMode: (m: CameraMode) => void
  setPreset: (p: ViewPreset) => void
  setDragging: (v: boolean) => void
  setShowQuality: (v: boolean) => void
  setCompact: (v: boolean) => void
  setPanelOpen: (v: boolean) => void
  resetPov: () => void
  setPovLookMode: (mode: PovLookMode) => void
  escape: () => void
}

const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches

export const useUiStore = create<UiState>((set) => ({
  compact,
  panelOpen: !compact,
  desktopPanelOpen: true,
  povResetNonce: 0,
  povLookMode: 'auto',
  cameraMode: 'orbit',
  viewPreset: 'coach',
  viewNonce: 0,
  dragging: false,
  showQuality: true,

  setCameraMode: (cameraMode) => set({ cameraMode }),
  setPreset: (viewPreset) => set((s) => ({ cameraMode: 'orbit', viewPreset, viewNonce: s.viewNonce + 1 })),
  setDragging: (dragging) => set({ dragging }),
  setShowQuality: (showQuality) => set({ showQuality }),
  setCompact: (compact) => set((s) => s.compact === compact ? s : ({
    compact, panelOpen: compact ? false : s.desktopPanelOpen,
  })),
  setPanelOpen: (panelOpen) => set((s) => ({
    panelOpen, ...(!s.compact ? { desktopPanelOpen: panelOpen } : {}),
  })),
  resetPov: () => set((s) => ({ povLookMode: 'auto', povResetNonce: s.povResetNonce + 1 })),
  setPovLookMode: (povLookMode) => set({ povLookMode }),
  escape: () => set((s) => s.compact && s.panelOpen ? { panelOpen: false } : { cameraMode: 'orbit' }),
}))
