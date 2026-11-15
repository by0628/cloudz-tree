import type { TreeTheme } from '../lib/types'
import { PALETTES } from '../components/TreeCanvas'

export interface HudState {
  score: number
  heightM: number
  stars: number
  hearts: number
}

export interface GameResult {
  score: number
  heightM: number
  stars: number
}

/**
 * 圣诞树攀爬游戏引擎（Canvas）。
 * 玩法：小人自动向上爬，玩家左右移动躲避横生树枝与掉落的雪球/装饰球，
 * 收集星星加分；镜头匀速上升，被树枝卡住或掉出画面底部、被砸中都会掉心，
 * 3 颗心耗尽结束。分数 = 高度 + 星星 × 50，难度随高度上升。
 */

export const GAME_W = 360
export const GAME_H = 560
const PLAYER_R = 13
const PX_PER_M = 48

interface Branch {
  y: number // 世界高度（枝底）
  side: 'left' | 'right'
  len: number
}
interface Pickup {
  x: number
  y: number
  taken: boolean
}
interface Hazard {
  x: number
  y: number
  vy: number
  r: number
  kind: 'snow' | 'ornament'
}

interface Callbacks {
  onHud: (h: HudState) => void
  onGameOver: (r: GameResult) => void
}

export class ClimbEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private theme: TreeTheme
  private cb: Callbacks
  private raf = 0
  private lastTs = 0
  private running = false
  private paused = false
  private destroyed = false

  private dir: -1 | 0 | 1 = 0
  private pointerDir: -1 | 0 | 1 = 0
  private keys = new Set<string>()

  private playerX = GAME_W / 2
  private playerY = 60
  private camY = 0
  private maxY = 60
  private hearts = 3
  private stars = 0
  private invincibleUntil = 0
  private elapsed = 0

  private branches: Branch[] = []
  private pickups: Pickup[] = []
  private hazards: Hazard[] = []
  private nextBranchY = 210
  private hazardTimer = 0
  private bgStars: { x: number; y: number; r: number }[] = []

  constructor(canvas: HTMLCanvasElement, theme: TreeTheme, cb: Callbacks) {
    this.canvas = canvas
    this.theme = theme
    this.cb = cb
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D 不可用')
    this.ctx = ctx
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = GAME_W * dpr
    canvas.height = GAME_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    for (let i = 0; i < 70; i++) {
      this.bgStars.push({ x: Math.random() * GAME_W, y: Math.random() * GAME_H, r: 0.6 + Math.random() * 1.4 })
    }
    this.bindInput()
    this.render(0)
    this.pushHud()
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      if (this.destroyed) return
      const dt = Math.min(0.033, (ts - this.lastTs) / 1000 || 0.016)
      this.lastTs = ts
      if (!this.paused) {
        this.step(dt, ts)
        this.render(ts)
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  setPaused(p: boolean) {
    this.paused = p
    if (!p) this.lastTs = performance.now()
  }

  setDir(d: -1 | 0 | 1) {
    this.dir = d
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.unbindInput()
  }

  // ---------- 输入 ----------
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
      this.keys.add(e.key.toLowerCase())
      e.preventDefault()
    }
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
  }
  private onPointerDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * GAME_W
    this.pointerDir = x < GAME_W / 2 ? -1 : 1
  }
  private onPointerUp = () => {
    this.pointerDir = 0
  }

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
  }
  private unbindInput() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
  }

  private currentDir(): -1 | 0 | 1 {
    if (this.dir !== 0) return this.dir
    if (this.pointerDir !== 0) return this.pointerDir
    if (this.keys.has('arrowleft') || this.keys.has('a')) return -1
    if (this.keys.has('arrowright') || this.keys.has('d')) return 1
    return 0
  }

  // ---------- 世界生成 ----------
  private ensureWorld() {
    const horizon = this.camY + GAME_H + 260
    while (this.nextBranchY < horizon) {
      const side: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right'
      const len = 104 + Math.random() * 84
      this.branches.push({ y: this.nextBranchY, side, len })
      // 枝条附近放一颗星（偏向空缺一侧，鼓励走位）
      if (Math.random() < 0.72) {
        const gapCenter = side === 'left' ? GAME_W - len / 2 - 26 : len / 2 + 26
        this.pickups.push({
          x: Math.max(24, Math.min(GAME_W - 24, gapCenter + (Math.random() - 0.5) * 60)),
          y: this.nextBranchY + 44 + Math.random() * 30,
          taken: false,
        })
      }
      this.nextBranchY += 86 + Math.random() * 44
    }
    const floor = this.camY - 140
    this.branches = this.branches.filter((b) => b.y > floor)
    this.pickups = this.pickups.filter((p) => p.y > floor && !p.taken)
    this.hazards = this.hazards.filter((hz) => hz.y > floor)
  }

  // ---------- 主循环 ----------
  private step(dt: number, ts: number) {
    this.elapsed += dt
    const scrollSpeed = Math.min(150, 58 + this.maxY / 230)
    const climbSpeed = scrollSpeed + 42

    this.camY += scrollSpeed * dt
    this.ensureWorld()

    // 水平移动
    const dir = this.currentDir()
    this.playerX += dir * 235 * dt
    this.playerX = Math.max(PLAYER_R + 4, Math.min(GAME_W - PLAYER_R - 4, this.playerX))

    // 垂直攀爬（被树枝挡住时停住）
    let newY = this.playerY + climbSpeed * dt
    for (const b of this.branches) {
      const bx0 = b.side === 'left' ? 0 : GAME_W - b.len
      const bx1 = b.side === 'left' ? b.len : GAME_W
      const withinX = this.playerX + PLAYER_R > bx0 + 4 && this.playerX - PLAYER_R < bx1 - 4
      const branchBottom = b.y
      const branchTop = b.y + 13
      if (withinX && this.playerY + PLAYER_R <= branchBottom + 1 && newY + PLAYER_R > branchBottom) {
        newY = branchBottom - PLAYER_R
      } else if (
        withinX &&
        this.playerY + PLAYER_R > branchBottom &&
        this.playerY - PLAYER_R < branchTop &&
        newY + PLAYER_R > branchBottom
      ) {
        // 已与枝条重叠（侧向挤入）：推出到枝下
        newY = Math.min(newY, branchBottom - PLAYER_R)
      }
    }
    this.playerY = newY
    if (this.playerY > this.maxY) this.maxY = this.playerY

    // 收集星星
    for (const p of this.pickups) {
      if (p.taken) continue
      const dx = p.x - this.playerX
      const dy = p.y - this.playerY
      if (dx * dx + dy * dy < 26 * 26) {
        p.taken = true
        this.stars += 1
      }
    }

    // 掉落物
    const spawnEvery = Math.max(0.42, 0.95 - this.maxY / 9500)
    this.hazardTimer -= dt
    if (this.hazardTimer <= 0) {
      this.hazardTimer = spawnEvery * (0.7 + Math.random() * 0.6)
      this.hazards.push({
        x: 18 + Math.random() * (GAME_W - 36),
        y: this.camY + GAME_H + 30,
        vy: 135 + Math.random() * 105,
        r: 9 + Math.random() * 4,
        kind: Math.random() < 0.55 ? 'snow' : 'ornament',
      })
    }
    const invincible = ts < this.invincibleUntil
    for (const hz of this.hazards) {
      hz.y -= hz.vy * dt
      if (invincible) continue
      const dx = hz.x - this.playerX
      const dy = hz.y - this.playerY
      if (dx * dx + dy * dy < (hz.r + PLAYER_R - 2) * (hz.r + PLAYER_R - 2)) {
        hz.y = -9999
        this.loseHeart(ts, true)
        if (this.hearts <= 0) return
      }
    }
    this.hazards = this.hazards.filter((hz) => hz.y > -100)

    // 掉出画面底部
    if (this.playerY < this.camY - 26) {
      this.loseHeart(ts, false)
      if (this.hearts <= 0) return
      this.playerY = this.camY + GAME_H * 0.34
      this.playerX = GAME_W / 2
    }

    this.pushHud()
  }

  private loseHeart(ts: number, knocked: boolean) {
    this.hearts -= 1
    this.invincibleUntil = ts + 1700
    if (knocked) this.playerY = Math.max(this.camY + 30, this.playerY - 34)
    this.pushHud()
    if (this.hearts <= 0) {
      this.running = false
      cancelAnimationFrame(this.raf)
      this.render(ts)
      this.cb.onGameOver(this.result())
    }
  }

  private result(): GameResult {
    const heightM = Math.round((this.maxY / PX_PER_M) * 10) / 10
    return { score: Math.floor(this.maxY / 10) + this.stars * 50, heightM, stars: this.stars }
  }

  private pushHud() {
    const r = this.result()
    this.cb.onHud({ score: r.score, heightM: r.heightM, stars: this.stars, hearts: Math.max(0, this.hearts) })
  }

  // ---------- 渲染 ----------
  private toScreenY(worldY: number): number {
    return GAME_H - (worldY - this.camY)
  }

  private render(ts: number) {
    const ctx = this.ctx
    const pal = PALETTES[this.theme]

    // 夜空
    const grad = ctx.createLinearGradient(0, 0, 0, GAME_H)
    grad.addColorStop(0, '#0a0f2a')
    grad.addColorStop(1, '#1a2450')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, GAME_W, GAME_H)

    // 远景星（视差）
    ctx.fillStyle = 'rgba(238,244,255,0.5)'
    for (const s of this.bgStars) {
      const y = (((s.y + this.camY * 0.25) % GAME_H) + GAME_H) % GAME_H
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(ts / 900 + s.x))
      ctx.beginPath()
      ctx.arc(s.x, GAME_H - y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 月亮
    ctx.fillStyle = '#f7ead1'
    ctx.beginPath()
    ctx.arc(GAME_W - 52, 54, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#131a3a'
    ctx.beginPath()
    ctx.arc(GAME_W - 62, 48, 17, 0, Math.PI * 2)
    ctx.fill()

    // 树干
    ctx.fillStyle = pal.trunk
    ctx.fillRect(GAME_W / 2 - 13, 0, 26, GAME_H)

    // 两侧树冠层（随高度滚动）
    const layerH = 92
    const off = this.camY % layerH
    for (let row = -1; row < GAME_H / layerH + 1; row++) {
      const baseY = row * layerH + off
      const depth = 1 - (row / (GAME_H / layerH + 1)) * 0.25
      ctx.fillStyle = pal.foliage[Math.min(4, Math.max(0, 4 - (row % 5)))]
      for (const sideSign of [-1, 1]) {
        const cx = GAME_W / 2 + sideSign * 13
        const tipX = cx + sideSign * 118 * depth
        const yTop = GAME_H - baseY - layerH
        ctx.beginPath()
        ctx.moveTo(cx, yTop)
        ctx.lineTo(tipX, yTop + layerH * 0.78)
        ctx.lineTo(cx, yTop + layerH * 0.92)
        ctx.closePath()
        ctx.fill()
        // 雪边
        ctx.fillStyle = 'rgba(244,249,255,0.75)'
        ctx.beginPath()
        ctx.moveTo(cx, yTop)
        ctx.lineTo(tipX, yTop + layerH * 0.78)
        ctx.lineTo(tipX - sideSign * 16, yTop + layerH * 0.78)
        ctx.lineTo(cx, yTop + 12)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = pal.foliage[Math.min(4, Math.max(0, 4 - (row % 5)))]
      }
    }

    // 地面（仅开局可见）
    if (this.camY < GAME_H) {
      const gy = this.toScreenY(0)
      ctx.fillStyle = '#f4f9ff'
      ctx.fillRect(0, gy, GAME_W, GAME_H - gy)
      ctx.fillStyle = '#c3d4f5'
      ctx.fillRect(0, gy, GAME_W, 3)
    }

    // 障碍树枝
    for (const b of this.branches) {
      const y = this.toScreenY(b.y + 13)
      const x0 = b.side === 'left' ? 0 : GAME_W - b.len
      ctx.fillStyle = pal.trunk
      ctx.fillRect(x0, y, b.len, 9)
      ctx.fillStyle = pal.foliage[3]
      ctx.fillRect(x0, y + 6, b.len, 7)
      ctx.fillStyle = 'rgba(244,249,255,0.9)'
      ctx.fillRect(x0, y - 2.5, b.len, 3.5)
      // 枝头挂饰
      const hx = b.side === 'left' ? b.len - 12 : GAME_W - b.len + 12
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.moveTo(hx, y + 13)
      ctx.lineTo(hx, y + 20)
      ctx.stroke()
      ctx.fillStyle = pal.ornament[0]
      ctx.beginPath()
      ctx.arc(hx, y + 26, 5.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // 星星收集物
    for (const p of this.pickups) {
      if (p.taken) continue
      const y = this.toScreenY(p.y)
      if (y < -20 || y > GAME_H + 20) continue
      const r = 9 + Math.sin(ts / 240 + p.x) * 1.3
      ctx.save()
      ctx.translate(p.x, y)
      ctx.rotate(Math.sin(ts / 500 + p.y) * 0.25)
      ctx.fillStyle = '#ffd94d'
      ctx.shadowColor = '#ffd94d'
      ctx.shadowBlur = 10
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45
        const a = (i * Math.PI) / 5 - Math.PI / 2
        ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // 掉落物
    for (const hz of this.hazards) {
      const y = this.toScreenY(hz.y)
      if (y < -24 || y > GAME_H + 24) continue
      if (hz.kind === 'snow') {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(hz.x, y, hz.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(160,200,255,0.55)'
        ctx.beginPath()
        ctx.arc(hz.x - hz.r * 0.3, hz.y ? y - hz.r * 0.3 : 0, hz.r * 0.38, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#e63946'
        ctx.beginPath()
        ctx.arc(hz.x, y, hz.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f5c04e'
        ctx.fillRect(hz.x - 3, y - hz.r - 3, 6, 4.5)
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.arc(hz.x - hz.r * 0.32, y - hz.r * 0.3, hz.r * 0.26, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 玩家
    const px = this.playerX
    const py = this.toScreenY(this.playerY)
    const invincible = performance.now() < this.invincibleUntil
    if (!(invincible && Math.floor(ts / 110) % 2 === 0)) {
      ctx.save()
      ctx.translate(px, py)
      // 身体（红外套）
      ctx.fillStyle = '#d62828'
      ctx.beginPath()
      ctx.arc(0, 2, PLAYER_R, 0, Math.PI * 2)
      ctx.fill()
      // 脸
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath()
      ctx.arc(0, -3.5, 7.6, 0, Math.PI * 2)
      ctx.fill()
      // 圣诞帽
      ctx.fillStyle = '#d62828'
      ctx.beginPath()
      ctx.moveTo(-8, -8)
      ctx.quadraticCurveTo(0, -20, 10, -13)
      ctx.quadraticCurveTo(2, -9, -8, -8)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-8.6, -9.6, 17.5, 3.6)
      ctx.beginPath()
      ctx.arc(10.6, -12.6, 3, 0, Math.PI * 2)
      ctx.fill()
      // 眼睛
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(-2.6, -3.8, 1.15, 0, Math.PI * 2)
      ctx.arc(2.6, -3.8, 1.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 底部危险渐变提示
    const danger = (this.playerY - this.camY) / GAME_H
    if (danger < 0.22) {
      const g2 = ctx.createLinearGradient(0, GAME_H - 60, 0, GAME_H)
      g2.addColorStop(0, 'rgba(230,57,70,0)')
      g2.addColorStop(1, `rgba(230,57,70,${0.35 * (1 - danger / 0.22)})`)
      ctx.fillStyle = g2
      ctx.fillRect(0, GAME_H - 60, GAME_W, 60)
    }
  }
}
