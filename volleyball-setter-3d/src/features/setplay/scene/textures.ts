import * as THREE from 'three'
import type { CourtTheme } from '../../../types'

const cache = new Map<string, THREE.Texture>()

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key)
  if (!t) {
    t = make()
    cache.set(key, t)
  }
  return t
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return { c, ctx }
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.Texture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 8
  return tex
}

/** 地板贴图：比赛区 + 无障碍区（蓝地胶 / 木地板两种主题），含细颗粒质感与边缘压暗 */
export function makeFloorTexture(theme: CourtTheme): THREE.Texture {
  return cached(`floor-${theme}`, () => {
    const W = 1536
    const H = 1024
    const { c, ctx } = canvas(W, H)
    // 地板世界范围：x∈[-13,13]，z∈[-4,13]
    const cx = (x: number) => ((x + 13) / 26) * W
    const cy = (z: number) => ((z + 4) / 17) * H
    const courtW = cx(9) - cx(-9)
    const courtH = cy(9) - cy(0)

    if (theme === 'blue') {
      ctx.fillStyle = '#6d8fbd'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#2e59a8'
      ctx.fillRect(cx(-9), cy(0), courtW, courtH)
      // 对方半场略微压暗，区分主次
      ctx.fillStyle = 'rgba(10, 20, 50, 0.14)'
      ctx.fillRect(cx(-9), cy(0), courtW / 2, courtH)
      // 地胶颗粒
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * W
        const y = Math.random() * H
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '10,18,40'}, ${Math.random() * 0.045})`
        ctx.fillRect(x, y, 2, 2)
      }
    } else {
      // 木地板：纵向板条 + 色差纹理
      const plank = 26
      for (let x = 0; x < W; x += plank) {
        const tone = 168 + Math.floor(Math.random() * 26)
        ctx.fillStyle = `rgb(${tone + 24}, ${tone - 22}, ${tone - 62})`
        ctx.fillRect(x, 0, plank, H)
        ctx.fillStyle = 'rgba(60, 34, 10, 0.35)'
        ctx.fillRect(x, 0, 2, H)
        for (let i = 0; i < 30; i++) {
          const y = Math.random() * H
          ctx.fillStyle = `rgba(90, 56, 20, ${Math.random() * 0.12})`
          ctx.fillRect(x + 2, y, plank - 4, 2)
        }
      }
      // 比赛区刷蓝漆（保留木纹透出）
      ctx.fillStyle = 'rgba(38, 84, 160, 0.82)'
      ctx.fillRect(cx(-9), cy(0), courtW, courtH)
    }

    // 边缘压暗（聚光氛围）
    const grad = ctx.createRadialGradient(W / 2, cy(4.5), H * 0.2, W / 2, cy(4.5), W * 0.62)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(4, 8, 20, 0.5)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    return toTexture(c)
  })
}

/** 球网贴图：透明底方格网线 */
export function makeNetTexture(): THREE.Texture {
  return cached('net', () => {
    const { c, ctx } = canvas(128, 128)
    ctx.clearRect(0, 0, 128, 128)
    ctx.strokeStyle = 'rgba(232, 238, 248, 0.95)'
    ctx.lineWidth = 7
    const step = 32
    for (let i = 0; i <= 128; i += step) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 128)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(128, i)
      ctx.stroke()
    }
    const tex = toTexture(c)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
  })
}

/** Logo 的金黄 / 深蓝弧形拼片。按球面方向绘制，避免经纬方格和极点条纹。 */
export function makeBallTexture(): THREE.Texture {
  return cached('ball', () => {
    const W = 1024
    const H = 512
    const { c, ctx } = canvas(W, H)
    const bump = canvas(W, H)
    const colorPixels = ctx.createImageData(W, H)
    const bumpPixels = bump.ctx.createImageData(W, H)
    const gold = [255, 208, 32], navy = [22, 60, 147]
    for (let row = 0; row < H; row++) {
      const latitude = Math.PI * row / (H - 1)
      const ring = Math.sin(latitude), sy = Math.cos(latitude)
      for (let col = 0; col < W; col++) {
        // SphereGeometry UVs; duplicate the meridian and use one sample at each pole.
        const longitude = 2 * Math.PI * col / (W - 1)
        const sx = -ring * Math.cos(longitude), sz = ring * Math.sin(longitude)
        // A smooth spherical twist gives the six three-panel groups curved edges.
        const yaw = 0.65 * sy + 0.35
        const x = sx * Math.cos(yaw) + sz * Math.sin(yaw)
        const z0 = -sx * Math.sin(yaw) + sz * Math.cos(yaw)
        const tilt = 0.5 * x + 0.35
        const y = sy * Math.cos(tilt) - z0 * Math.sin(tilt)
        const z = sy * Math.sin(tilt) + z0 * Math.cos(tilt)
        const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z)
        let across: number, along: number
        if (ax >= ay && ax >= az) { across = z / ax; along = y / ax }
        else if (ay >= az) { across = x / ay; along = z / ay }
        else { across = y / az; along = x / az }
        const blue = Math.abs(across) < 1 / 3
        const edge = Math.min(1 - Math.abs(across), 1 - Math.abs(along), Math.abs(Math.abs(across) - 1 / 3))
        const seam = 1 - THREE.MathUtils.smoothstep(edge, 0.002, 0.014)
        // Fine, deterministic pebbling lives on the sphere, including across the UV seam.
        const grain = Math.sin(sx * 235 + Math.sin(sz * 97)) * Math.sin(sy * 241 + sz * 113)
        const tone = 1 + grain * 0.018 - seam * 0.22
        const rgb = blue ? navy : gold
        const i = (row * W + col) * 4
        for (let channel = 0; channel < 3; channel++) {
          colorPixels.data[i + channel] = rgb[channel] * tone
          bumpPixels.data[i + channel] = 170 + grain * 13 - seam * 100
        }
        colorPixels.data[i + 3] = bumpPixels.data[i + 3] = 255
      }
    }
    ctx.putImageData(colorPixels, 0, 0)
    bump.ctx.putImageData(bumpPixels, 0, 0)
    const map = toTexture(c), bumpMap = toTexture(bump.c, false)
    map.wrapS = bumpMap.wrapS = THREE.RepeatWrapping
    cache.set('ball-bump', bumpMap)
    return map
  })
}

export function makeBallBumpTexture(): THREE.Texture {
  makeBallTexture()
  return cache.get('ball-bump')!
}

/** 球员职能贴图（白字描边，透明底） */
export function makeRoleTexture(role: string): THREE.Texture {
  return cached(`role-${role}`, () => {
    const { c, ctx } = canvas(512, 128)
    ctx.clearRect(0, 0, 512, 128)
    ctx.font = '700 92px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(10, 14, 26, 0.9)'
    ctx.lineWidth = 10
    ctx.strokeText(role, 256, 68)
    ctx.fillStyle = '#f5f7fa'
    ctx.fillText(role, 256, 68)
    return toTexture(c)
  })
}

/** 地面文字贴图（号位标注） */
export function makeZoneLabelTexture(text: string): THREE.Texture {
  return cached(`zone-${text}`, () => {
    const { c, ctx } = canvas(256, 256)
    ctx.clearRect(0, 0, 256, 256)
    ctx.font = '900 190px "Arial Black", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillText(text, 128, 138)
    return toTexture(c)
  })
}

/** 标志杆红白条纹 */
export function makeAntennaTexture(): THREE.Texture {
  return cached('antenna', () => {
    const { c, ctx } = canvas(64, 256)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#d64545' : '#f2f4f8'
      ctx.fillRect(0, (i * 256) / 8, 64, 256 / 8)
    }
    const tex = toTexture(c)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
  })
}

/** 背景渐变（暗色摄影棚氛围） */
export function makeBackdropTexture(): THREE.Texture {
  return cached('backdrop', () => {
    const { c, ctx } = canvas(32, 512)
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#0a0f1e')
    g.addColorStop(0.45, '#233457')
    g.addColorStop(0.8, '#101a30')
    g.addColorStop(1, '#0a0e18')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 512)
    return toTexture(c)
  })
}
