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

/** 排球贴图：经典六组三色（蓝/黄/白）18 片外观 + 深色缝线 */
export function makeBallTexture(): THREE.Texture {
  return cached('ball', () => {
    const W = 1024
    const H = 512
    const { c, ctx } = canvas(W, H)
    const colors = ['#1d4fa1', '#f2c53d', '#f3f2ec']
    const sector = W / 6
    for (let i = 0; i < 6; i++) {
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = colors[(i + b) % 3]
        const y0 = (b * H) / 3
        ctx.fillRect(i * sector, y0, sector + 1, H / 3 + 1)
      }
    }
    // 缝线：纵向组界 + 组内条带界（略微倾斜模拟球面拼接）
    ctx.strokeStyle = 'rgba(20, 22, 26, 0.9)'
    ctx.lineWidth = 5
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath()
      ctx.moveTo(i * sector, 0)
      ctx.lineTo(i * sector, H)
      ctx.stroke()
    }
    ctx.lineWidth = 4
    for (let b = 1; b < 3; b++) {
      ctx.beginPath()
      ctx.moveTo(0, (b * H) / 3)
      ctx.lineTo(W, (b * H) / 3)
      ctx.stroke()
    }
    // 高光晕染（增强球感）
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(0.5, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.12)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    return toTexture(c)
  })
}

/** 号码贴图（白字描边，透明底） */
export function makeNumberTexture(num: number): THREE.Texture {
  return cached(`num-${num}`, () => {
    const { c, ctx } = canvas(256, 256)
    ctx.clearRect(0, 0, 256, 256)
    ctx.font = '900 168px "Arial Black", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(10, 14, 26, 0.6)'
    ctx.lineWidth = 18
    ctx.strokeText(String(num), 128, 138)
    ctx.fillStyle = '#f5f7fa'
    ctx.fillText(String(num), 128, 138)
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
