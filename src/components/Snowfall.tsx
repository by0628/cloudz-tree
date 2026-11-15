import { useEffect, useRef } from 'react'

interface Flake {
  x: number
  y: number
  r: number
  speed: number
  sway: number
  phase: number
  alpha: number
}

/** 全屏雪花粒子背景（Canvas，低开销，支持 reduced-motion）。 */
export default function Snowfall({ density = 80 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let raf = 0
    const flakes: Flake[] = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const count = reduced ? Math.floor(density / 3) : density
    for (let i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.8 + Math.random() * 2.2,
        speed: 0.3 + Math.random() * 0.9,
        sway: 12 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.55,
      })
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const f of flakes) {
        const x = f.x + Math.sin(t / 1600 + f.phase) * f.sway * 0.3
        ctx.beginPath()
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(238, 244, 255, ${f.alpha})`
        ctx.fill()
        if (!reduced) {
          f.y += f.speed
          if (f.y > h + 4) {
            f.y = -4
            f.x = Math.random() * w
          }
        }
      }
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [density])

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
}
