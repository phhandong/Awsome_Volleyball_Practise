import { useMemo } from 'react'
import { BALL_RADIUS } from '../../../logic/rig'
import { makeBallBumpTexture, makeBallTexture } from './textures'

/** Main scene and motion review share the same logo-inspired volleyball surface. */
export function BallSurface() {
  const maps = useMemo(() => ({ map: makeBallTexture(), bumpMap: makeBallBumpTexture() }), [])
  return <>
    <sphereGeometry args={[BALL_RADIUS, 48, 32]} />
    <meshPhysicalMaterial {...maps} bumpScale={0.00035} roughness={0.58}
      clearcoat={0.12} clearcoatRoughness={0.65} />
  </>
}
