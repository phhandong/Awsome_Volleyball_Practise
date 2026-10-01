import { afterEach, expect, it } from 'vitest'
import { useUiStore } from '../store/uiStore'

const saved = useUiStore.getState()
afterEach(() => useUiStore.setState(saved))

it.each(['coach', 'baseline', 'side', 'top'] as const)('从二传第一人称选择 %s 机位会退出第一人称并到达所选机位', preset => {
  useUiStore.getState().setCameraMode('pov')
  const nonce = useUiStore.getState().viewNonce
  useUiStore.getState().setPreset(preset)
  expect(useUiStore.getState()).toMatchObject({ cameraMode: 'orbit', viewPreset: preset, viewNonce: nonce + 1 })
  useUiStore.getState().setPreset(preset)
  expect(useUiStore.getState().viewNonce).toBe(nonce + 2)
})

it.each([true, false])('手机抽屉独立于桌面侧栏，返回桌面恢复展开状态 %s', desktopOpen => {
  const ui = useUiStore.getState()
  ui.setCompact(false)
  ui.setPanelOpen(desktopOpen)
  ui.setCompact(true)
  expect(useUiStore.getState().panelOpen).toBe(false)
  ui.setPanelOpen(true)
  // 手机竖屏尺寸变化不重新关闭已打开的抽屉。
  ui.setCompact(true)
  expect(useUiStore.getState().panelOpen).toBe(true)
  ui.setCompact(false)
  expect(useUiStore.getState().panelOpen).toBe(desktopOpen)
})

it('Esc 先关闭手机抽屉，再退出第一人称', () => {
  const ui = useUiStore.getState()
  ui.setCompact(true)
  ui.setCameraMode('pov')
  ui.setPanelOpen(true)
  ui.escape()
  expect(useUiStore.getState()).toMatchObject({ cameraMode: 'pov', panelOpen: false })
  ui.escape()
  expect(useUiStore.getState().cameraMode).toBe('orbit')
})

it('重复回正会重新触发，折叠和回正保留相机模式及机位', () => {
  const ui = useUiStore.getState()
  ui.setCameraMode('pov')
  const before = useUiStore.getState()
  ui.setPanelOpen(false)
  ui.resetPov()
  ui.resetPov()
  expect(useUiStore.getState()).toMatchObject({
    cameraMode: 'pov', viewPreset: before.viewPreset, viewNonce: before.viewNonce,
    povResetNonce: before.povResetNonce + 2,
  })
})
