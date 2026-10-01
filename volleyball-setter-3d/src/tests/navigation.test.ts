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
