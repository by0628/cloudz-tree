import { useEffect, useRef } from 'react'
import type { TreeTheme } from '../lib/types'

interface Palette {
  foliage: string[]
  trunk: string
  lights: string[]
  ornament: string[]
  star: string
  snow: string
}

export const PALETTES: Record<TreeTheme, Palette> = {
  classic: {
    foliage: ['#0e3d21', '#14532d', '#166534', '#1c7a3f', '#27a35c'],
    trunk: '#6b4423',
    lights: ['#ffd97a', '#ff7a6b', '#7ed6a5', '#7cc7ff', '#ffb3e2'],
    ornament: ['#e63946', '#f5c04e', '#eef4ff'],
    star: '#ffd94d',
    snow: '#f4f9ff',
  },
  ice: {
    foliage: ['#0b3547', '#0f4c64', '#14667f', '#1b84a8', '#38bdf8'],
    trunk: '#4a3b30',
    lights: ['#e0f7ff', '#a5f3fc', '#ffffff', '#bae6fd'],
    ornament: ['#e0f2fe', '#7dd3fc', '#ffffff'],
    star: '#e8fbff',
    snow: '#ffffff',
  },
  candy: {
    foliage: ['#14532d', '#166534', '#1e8a4c', '#27a35c', '#3cb371'],
    trunk: '#7a4a21',
    lights: ['#ffb3e2', '#ffffff', '#ff8fa3', '#ffd97a'],
    ornament: ['#ff5d8f', '#ffffff', '#ff8fa3', '#e63946'],
    star: '#ffb3e2',
    snow: '#fff5f7',
  },
}

interface LightDot {
  lx: number
  layer: number
  color: string
  phase: number
  size: number
}

/** 生成固定伪随机彩灯布局（按主题种子，保证每次渲染一致）。 */
function makeLights(theme: TreeTheme): LightDot[] {
  let seed = theme === 'classic' ? 42 : theme === 'ice' ? 77 : 123
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const pal = PALETTES[theme]
  const dots: LightDot[] = []
  for (let layer = 0; layer < 5; layer++) {
    const n = 5 + layer * 2
    for (let i = 0; i < n; i++) {
      dots.push({
        lx: (i + 0.5) / n + (rand() - 0.5) * 0.08,
        layer,
        color: pal.lights[Math.floor(rand() * pal.lights.length)],
        phase: rand() * Math.PI * 2,
        size: 2 + rand() * 2.2,
      })
    }
  }
  return dots
}

const W = 320
const H = 400
const LAYERS = 5

function layerGeom(i: number) {
  // i: 0 顶层 → 4 底层
  const topY = 62 + i * 56
  const halfW = 34 + i * 27
  const bottomY = topY + 92
  return { topY, halfW, bottomY, cx: W / 2 }
}

function drawTree(ctx: CanvasRenderingContext2D, theme: TreeTheme, lights: LightDot[], t: number) {
  const pal = PALETTES[theme]
  ctx.clearRect(0, 0, W, H)

  // 地面雪丘
  ctx.fillStyle = pal.snow
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.ellipse(W / 2, H - 12, 138, 20, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // 树干
  ctx.fillStyle = pal.trunk
  ctx.fillRect(W / 2 - 9, H - 66, 18, 46)

  // 树层（从底往顶画）
  for (let i = LAYERS - 1; i >= 0; i--) {
    const g = layerGeom(i)
    ctx.fillStyle = pal.foliage[i]
    ctx.beginPath()
    ctx.moveTo(g.cx, g.topY)
    ctx.quadraticCurveTo(g.cx + g.halfW * 0.72, g.topY + 44, g.cx + g.halfW, g.bottomY)
    ctx.quadraticCurveTo(g.cx, g.bottomY + 14, g.cx - g.halfW, g.bottomY)
    ctx.quadraticCurveTo(g.cx - g.halfW * 0.72, g.topY + 44, g.cx, g.topY)
    ctx.fill()
    // 雪顶
    ctx.fillStyle = pal.snow
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(g.cx, g.topY)
    ctx.quadraticCurveTo(g.cx + g.halfW * 0.34, g.topY + 16, g.cx + g.halfW * 0.52, g.bottomY - 46)
    ctx.quadraticCurveTo(g.cx, g.topY + 26, g.cx - g.halfW * 0.52, g.bottomY - 46)
    ctx.quadraticCurveTo(g.cx - g.halfW * 0.34, g.topY + 16, g.cx, g.topY)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 装饰球
  for (let i = 0; i < LAYERS; i++) {
    const g = layerGeom(i)
    const n = 2 + i
    for (let j = 0; j < n; j++) {
      const fx = (j + 0.5) / n
      const x = g.cx - g.halfW * 0.78 + fx * g.halfW * 1.56
      const y = g.bottomY - 12 - ((j * 37 + i * 13) % 18)
      ctx.fillStyle = pal.ornament[(i + j) % pal.ornament.length]
      ctx.beginPath()
      ctx.arc(x, y, 4.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.arc(x - 1.4, y - 1.6, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 彩灯（闪烁 + 光晕）
  for (const d of lights) {
    const g = layerGeom(d.layer)
    const x = g.cx - g.halfW * 0.86 + d.lx * g.halfW * 1.72
    const y = g.bottomY - 22 - ((d.lx * 997) % 26)
    const glow = 0.55 + 0.45 * Math.sin(t / 480 + d.phase)
    ctx.save()
    ctx.globalAlpha = 0.28 * glow
    ctx.fillStyle = d.color
    ctx.beginPath()
    ctx.arc(x, y, d.size * 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.65 + 0.35 * glow
    ctx.beginPath()
    ctx.arc(x, y, d.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 树顶星
  const sx = W / 2
  const sy = 44
  const pulse = 1 + 0.06 * Math.sin(t / 500)
  ctx.save()
  ctx.translate(sx, sy)
  ctx.scale(pulse, pulse)
  ctx.fillStyle = pal.star
  ctx.shadowColor = pal.star
  ctx.shadowBlur = 16
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 15 : 6.4
    const a = (i * Math.PI) / 5 - Math.PI / 2
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 树下礼物
  const gifts: [number, number, number, string][] = [
    [W / 2 - 58, H - 34, 26, '#e63946'],
    [W / 2 + 34, H - 32, 22, '#3a6fd8'],
    [W / 2 - 20, H - 30, 18, '#e8a91c'],
  ]
  for (const [x, y, s, c] of gifts) {
    ctx.fillStyle = c
    ctx.fillRect(x, y, s, s * 0.72)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(x + s / 2 - 2, y, 4, s * 0.72)
    ctx.fillRect(x, y + s * 0.3, s, 3.4)
  }
}

/** 装饰性圣诞树（Canvas 分层渲染 + 彩灯动画）。 */
export default function TreeCanvas({
  theme,
  className,
  animated = true,
}: {
  theme: TreeTheme
  className?: string
  animated?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const lights = makeLights(theme)
    let raf = 0
    if (animated) {
      const loop = (t: number) => {
        drawTree(ctx, theme, lights, t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    } else {
      drawTree(ctx, theme, lights, 900)
    }
    return () => cancelAnimationFrame(raf)
  }, [theme, animated])

  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${W} / ${H}` }} className={className} aria-label="圣诞树" />
}
