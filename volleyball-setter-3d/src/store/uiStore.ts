import { create } from 'zustand'

export type CameraMode = 'orbit' | 'pov'
export type ViewPreset = 'coach' | 'baseline' | 'side' | 'top'

interface UiState {
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
}

export const useUiStore = create<UiState>((set) => ({
  cameraMode: 'orbit',
  viewPreset: 'coach',
  viewNonce: 0,
  dragging: false,
  showQuality: true,

  setCameraMode: (cameraMode) => set({ cameraMode }),
  setPreset: (viewPreset) => set((s) => ({ cameraMode: 'orbit', viewPreset, viewNonce: s.viewNonce + 1 })),
  setDragging: (dragging) => set({ dragging }),
  setShowQuality: (showQuality) => set({ showQuality }),
}))
