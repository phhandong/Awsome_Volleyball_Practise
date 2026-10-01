type Vec3 = [number, number, number]

/** 沿预设视线退后，给球场四角及网上空间留 8% 边距。仅用于全景/俯视。 */
export function fitCourtPosition(position: Vec3, target: Vec3, aspect: number, fov = 50): Vec3 {
  const offset = position.map((v, i) => v - target[i])
  const distance = Math.hypot(...offset)
  const back = offset.map(v => v / distance)
  const rightLength = Math.hypot(back[0], back[2])
  const right = [back[2] / rightLength, 0, -back[0] / rightLength]
  const up = [-back[1] * right[2], back[2] * right[0] - back[0] * right[2], back[1] * right[0]]
  const tanV = Math.tan(fov * Math.PI / 360)
  const tanH = tanV * Math.max(0.1, aspect)
  const dot = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * b[i], 0)
  let required = distance
  for (const x of [-9.4, 9.4]) for (const y of [0, 3.6]) for (const z of [-0.4, 9.4]) {
    const relative = [x - target[0], y - target[1], z - target[2]]
    required = Math.max(required, dot(relative, back) + 1.08 * Math.max(
      Math.abs(dot(relative, right)) / tanH, Math.abs(dot(relative, up)) / tanV,
    ))
  }
  return target.map((v, i) => v + back[i] * required) as Vec3
}
