/** 躯干车削轮廓（半径、高度），身体与文字贴片共用，避免表面相交。 */
export const TORSO_PROFILE: readonly (readonly [number, number])[] = [
  [0.105, 0], [0.128, 0.045], [0.142, 0.13], [0.155, 0.24],
  [0.16, 0.33], [0.147, 0.4], [0.095, 0.46], [0.06, 0.49], [0.056, 0.51],
]

export function torsoRadiusAt(y: number): number {
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    const [r0, y0] = TORSO_PROFILE[i - 1]
    const [r1, y1] = TORSO_PROFILE[i]
    if (y <= y1) return r0 + (r1 - r0) * Math.max(0, (y - y0) / (y1 - y0))
  }
  return TORSO_PROFILE[TORSO_PROFILE.length - 1][0]
}

/** 横向 UV 保持文字比例；深度贴合胸部曲面，向外留 1.5mm。背面绕 Y 旋转 π 共用。 */
export function createJerseyLabelSurface() {
  const columns = 32
  const rows = 8
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= rows; row++) {
    const v = row / rows
    const y = 0.265 + v * 0.07
    const radius = torsoRadiusAt(y) + 0.0015
    for (let column = 0; column <= columns; column++) {
      const u = column / columns
      const x = (u - 0.5) * 0.28
      positions.push(x, y, Math.sqrt(radius * radius - x * x))
      uvs.push(u, v)
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column
        const b = a + 1
        const c = a + columns + 1
        const d = c + 1
        indices.push(a, b, c, b, d, c)
      }
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices }
}
