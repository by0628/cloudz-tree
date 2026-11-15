import type { TreeTheme } from '../lib/types'
import { PALETTES } from '../components/TreeCanvas'

export interface HudState {
  score: number
  heightM: number
  stars: number
  ornaments: number
  hearts: number
  /** 登顶进度 0..1 */
  progress: number
  /** 当前随机事件提示文案（无事件时为空） */
  eventText: string
  /** 事件序号，变化时前端播放提示动画 */
  eventKey: number
}

export interface GameResult {
  score: number
  heightM: number
  stars: number
  ornaments: number
  finished: boolean
}

/**
 * 圣诞树攀爬游戏引擎（Canvas）· v2
 *
 * 坐标系（本次重构的核心）：
 * - 世界坐标：y 向上为正，地面 y=0，树顶 y=FINISH_Y（真实终点，100 米）。
 * - 屏幕坐标：toScreenY(worldY) = GAME_H - (worldY - camY)，camY 是镜头底边对应的世界高度。
 * - 镜头跟随角色：camY 向「角色应处锚点」平滑靠拢，且每帧硬性钳制
 *   SAFE_LOW ≤ playerY - camY ≤ SAFE_HIGH —— 角色数学上不可能出画。
 * - 世界生成锚定在 max(camY, playerY) 的地平线，不再锚定在匀速镜头上。
 *
 * 玩法：角色自动向上爬，玩家左右移动躲避横生树枝与掉落物，收集星星（+50）
 * 与装饰球（+30）、礼物盒（回心/加分）；随机事件（顺风/雪球雨/精灵礼物/灯串）
 * 周期出现；被砸中掉心，3 颗心耗尽结束；爬到树顶大星星处登顶（+500）。
 */

export const GAME_W = 360
export const GAME_H = 560
const PLAYER_R = 13
const PX_PER_M = 48
/** 树顶高度（世界单位）= 100 米，真实终点 */
export const FINISH_Y = PX_PER_M * 100
/** 镜头锚点：角色静止时距画面底部的比例 */
const CAM_ANCHOR = GAME_H * 0.4
/** 安全区：角色与镜头底边的距离必须落在 [SAFE_LOW, SAFE_HIGH] */
const SAFE_LOW = GAME_H * 0.14
const SAFE_HIGH = GAME_H * 0.82

interface Branch {
  y: number
  side: 'left' | 'right'
  len: number
}
interface Pickup {
  x: number
  y: number
  kind: 'star' | 'ornament' | 'gift'
  taken: boolean
}
interface Hazard {
  x: number
  y: number
  vy: number
  r: number
  kind: 'snow' | 'ornament'
}
type EventKind = 'wind' | 'storm' | 'gift' | 'lights'

interface Callbacks {
  onHud: (h: HudState) => void
  onGameOver: (r: GameResult) => void
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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
  private ended = false

  private dir: -1 | 0 | 1 = 0
  private pointerDir: -1 | 0 | 1 = 0
  private keys = new Set<string>()

  private playerX = GAME_W / 2
  private playerY = 60
  private camY = 0
  private maxY = 60
  private hearts = 3
  private stars = 0
  private ornaments = 0
  private bonusScore = 0
  private finished = false
  private invincibleUntil = 0

  private branches: Branch[] = []
  private pickups: Pickup[] = []
  private hazards: Hazard[] = []
  private nextBranchY = 210
  private hazardTimer = 0
  private bgStars: { x: number; y: number; r: number }[] = []

  private eventTimer = 10 + Math.random() * 5
  private eventKind: EventKind | null = null
  private eventUntil = 0
  private bannerText = ''
  private bannerUntil = 0
  private eventKey = 0

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
    this.pushHud(0)
  }

  start() {
    if (this.running || this.ended) return
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

  // ---------- 世界生成（锚定角色/镜头地平线，封顶到树顶） ----------
  private ensureWorld() {
    const horizon = Math.min(FINISH_Y - 170, Math.max(this.camY, this.playerY) + GAME_H + 280)
    while (this.nextBranchY < horizon) {
      const side: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right'
      const len = 104 + Math.random() * 84
      this.branches.push({ y: this.nextBranchY, side, len })
      const gapCenter = side === 'left' ? GAME_W - len / 2 - 26 : len / 2 + 26
      const roll = Math.random()
      if (roll < 0.62) {
        this.pickups.push({
          x: clamp(gapCenter + (Math.random() - 0.5) * 60, 24, GAME_W - 24),
          y: this.nextBranchY + 46 + Math.random() * 28,
          kind: 'star',
          taken: false,
        })
      } else if (roll < 0.82) {
        this.pickups.push({
          x: clamp(gapCenter + (Math.random() - 0.5) * 80, 24, GAME_W - 24),
          y: this.nextBranchY + 40 + Math.random() * 30,
          kind: 'ornament',
          taken: false,
        })
      }
      this.nextBranchY += 86 + Math.random() * 44
    }
    const floor = this.camY - 160
    this.branches = this.branches.filter((b) => b.y > floor)
    this.pickups = this.pickups.filter((p) => p.y > floor && !p.taken)
    this.hazards = this.hazards.filter((hz) => hz.y > floor)
  }

  // ---------- 随机事件 ----------
  private startEvent(ts: number) {
    const kinds: EventKind[] = ['wind', 'storm', 'gift', 'lights']
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    this.eventKind = kind
    this.eventKey += 1
    if (kind === 'wind') {
      this.eventUntil = ts + 5000
      this.showBanner('🌬️ 顺风来了，爬得更快啦！', ts)
    } else if (kind === 'storm') {
      this.eventUntil = ts + 6000
      this.showBanner('🌨️ 雪球雨！小心头顶！', ts)
    } else if (kind === 'gift') {
      this.eventUntil = ts
      this.pickups.push({
        x: clamp(this.playerX + (Math.random() - 0.5) * 120, 30, GAME_W - 30),
        y: Math.min(FINISH_Y - 60, this.playerY + GAME_H * 0.75),
        kind: 'gift',
        taken: false,
      })
      this.showBanner('🧝 林间精灵留下了一个礼物盒！', ts)
    } else {
      this.eventUntil = ts
      for (let i = 0; i < 5; i++) {
        this.pickups.push({
          x: clamp(GAME_W / 2 + Math.sin(i * 0.9) * 90, 24, GAME_W - 24),
          y: Math.min(FINISH_Y - 40, this.playerY + 120 + i * 62),
          kind: 'star',
          taken: false,
        })
      }
      this.showBanner('✨ 灯串亮起，星星排队啦！', ts)
    }
  }

  private showBanner(text: string, ts: number) {
    this.bannerText = text
    this.bannerUntil = ts + 3400
  }

  // ---------- 主循环 ----------
  private step(dt: number, ts: number) {
    if (this.ended) return

    // 事件调度
    this.eventTimer -= dt
    if (this.eventTimer <= 0) {
      this.startEvent(ts)
      this.eventTimer = 13 + Math.random() * 8
    }
    const windActive = this.eventKind === 'wind' && ts < this.eventUntil
    const stormActive = this.eventKind === 'storm' && ts < this.eventUntil

    const difficulty = Math.min(1, this.maxY / FINISH_Y)
    const climbSpeed = (94 + difficulty * 34) * (windActive ? 1.5 : 1)

    this.ensureWorld()

    // 水平移动（钳制在游戏边界内）
    const dir = this.currentDir()
    this.playerX += dir * 238 * dt
    this.playerX = clamp(this.playerX, PLAYER_R + 4, GAME_W - PLAYER_R - 4)

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
        newY = Math.min(newY, branchBottom - PLAYER_R)
      }
    }
    this.playerY = Math.min(newY, FINISH_Y)
    if (this.playerY > this.maxY) this.maxY = this.playerY

    // ★ 镜头跟随：先平滑靠拢锚点，再硬钳制进安全区 —— 角色永不出画
    const target = clamp(this.playerY - CAM_ANCHOR, 0, FINISH_Y)
    this.camY += (target - this.camY) * Math.min(1, dt * 6.5)
    if (this.playerY - this.camY > SAFE_HIGH) this.camY = this.playerY - SAFE_HIGH
    if (this.playerY - this.camY < SAFE_LOW) this.camY = this.playerY - SAFE_LOW
    this.camY = clamp(this.camY, 0, FINISH_Y)

    // 登顶
    if (this.playerY >= FINISH_Y) {
      this.finished = true
      this.endRun(ts)
      return
    }

    // 收集
    for (const p of this.pickups) {
      if (p.taken) continue
      const dx = p.x - this.playerX
      const dy = p.y - this.playerY
      if (dx * dx + dy * dy < 27 * 27) {
        p.taken = true
        if (p.kind === 'star') this.stars += 1
        else if (p.kind === 'ornament') this.ornaments += 1
        else if (this.hearts < 3) {
          this.hearts += 1
          this.showBanner('🎁 礼物盒：爱心 +1！', ts)
        } else {
          this.bonusScore += 100
          this.showBanner('🎁 礼物盒：+100 分！', ts)
        }
      }
    }

    // 掉落物
    const spawnEvery = Math.max(0.4, 0.95 - difficulty * 0.5) / (stormActive ? 2.2 : 1)
    this.hazardTimer -= dt
    if (this.hazardTimer <= 0) {
      this.hazardTimer = spawnEvery * (0.7 + Math.random() * 0.6)
      this.hazards.push({
        x: 18 + Math.random() * (GAME_W - 36),
        y: this.camY + GAME_H + 30,
        vy: 140 + Math.random() * 110 + difficulty * 60,
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
        this.loseHeart(ts)
        if (this.hearts <= 0) return
      }
    }
    this.hazards = this.hazards.filter((hz) => hz.y > -100)

    this.pushHud(ts)
  }

  private loseHeart(ts: number) {
    this.hearts -= 1
    this.invincibleUntil = ts + 1700
    this.playerY = Math.max(44, this.playerY - 30)
    this.pushHud(ts)
    if (this.hearts <= 0) this.endRun(ts)
  }

  private endRun(ts: number) {
    if (this.ended) return
    this.ended = true
    this.running = false
    cancelAnimationFrame(this.raf)
    this.render(ts)
    this.pushHud(ts)
    this.cb.onGameOver(this.result())
  }

  private result(): GameResult {
    const heightM = Math.round((this.maxY / PX_PER_M) * 10) / 10
    const score =
      Math.floor(this.maxY / 10) + this.stars * 50 + this.ornaments * 30 + this.bonusScore + (this.finished ? 500 : 0)
    return { score, heightM, stars: this.stars, ornaments: this.ornaments, finished: this.finished }
  }

  private pushHud(ts: number) {
    const r = this.result()
    this.cb.onHud({
      score: r.score,
      heightM: r.heightM,
      stars: this.stars,
      ornaments: this.ornaments,
      hearts: Math.max(0, this.hearts),
      progress: clamp(this.maxY / FINISH_Y, 0, 1),
      eventText: ts < this.bannerUntil ? this.bannerText : '',
      eventKey: this.eventKey,
    })
  }

  // ---------- 渲染 ----------
  private toScreenY(worldY: number): number {
    return GAME_H - (worldY - this.camY)
  }

  private drawStar(cx: number, cy: number, r: number, color: string, glow = 0) {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = color
    if (glow > 0) {
      ctx.shadowColor = color
      ctx.shadowBlur = glow
    }
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45
      const a = (i * Math.PI) / 5 - Math.PI / 2
      ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
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

    // 两侧树冠层（随镜头滚动）
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

    // 树顶（进入视野时绘制：平台 + 大星星）
    const topY = this.toScreenY(FINISH_Y)
    if (topY > -140 && topY < GAME_H + 60) {
      const pulse = 1 + Math.sin(ts / 300) * 0.06
      ctx.save()
      ctx.fillStyle = 'rgba(255,217,77,0.16)'
      ctx.beginPath()
      ctx.arc(GAME_W / 2, topY - 26, 74 * pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      this.drawStar(GAME_W / 2, topY - 26, 34 * pulse, '#ffd94d', 22)
      ctx.fillStyle = '#f4f9ff'
      ctx.fillRect(GAME_W / 2 - 86, topY + 6, 172, 7)
      ctx.fillStyle = pal.foliage[2]
      ctx.fillRect(GAME_W / 2 - 86, topY + 13, 172, 6)
    }

    // 障碍树枝
    for (const b of this.branches) {
      const y = this.toScreenY(b.y + 13)
      if (y < -30 || y > GAME_H + 30) continue
      const x0 = b.side === 'left' ? 0 : GAME_W - b.len
      ctx.fillStyle = pal.trunk
      ctx.fillRect(x0, y, b.len, 9)
      ctx.fillStyle = pal.foliage[3]
      ctx.fillRect(x0, y + 6, b.len, 7)
      ctx.fillStyle = 'rgba(244,249,255,0.9)'
      ctx.fillRect(x0, y - 2.5, b.len, 3.5)
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

    // 收集物
    for (const p of this.pickups) {
      if (p.taken) continue
      const y = this.toScreenY(p.y)
      if (y < -24 || y > GAME_H + 24) continue
      if (p.kind === 'star') {
        ctx.save()
        ctx.translate(p.x, y)
        ctx.rotate(Math.sin(ts / 500 + p.y) * 0.25)
        this.drawStar(0, 0, 9 + Math.sin(ts / 240 + p.x) * 1.3, '#ffd94d', 10)
        ctx.restore()
      } else if (p.kind === 'ornament') {
        const bob = Math.sin(ts / 420 + p.x) * 2
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'
        ctx.beginPath()
        ctx.moveTo(p.x, y - 12 + bob)
        ctx.lineTo(p.x, y - 6 + bob)
        ctx.stroke()
        ctx.fillStyle = pal.ornament[1]
        ctx.beginPath()
        ctx.arc(p.x, y + 2 + bob, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath()
        ctx.arc(p.x - 2.6, y - 0.5 + bob, 2.4, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // 礼物盒
        const bob = Math.sin(ts / 380 + p.x) * 2
        ctx.save()
        ctx.translate(p.x, y + bob)
        ctx.shadowColor = '#ffd94d'
        ctx.shadowBlur = 8
        ctx.fillStyle = '#e63946'
        ctx.fillRect(-10, -7, 20, 15)
        ctx.fillStyle = '#ffd94d'
        ctx.fillRect(-2, -7, 4, 15)
        ctx.fillRect(-11, -10, 22, 5)
        ctx.fillRect(-2, -10, 4, 5)
        ctx.restore()
      }
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
        ctx.arc(hz.x - hz.r * 0.3, y - hz.r * 0.3, hz.r * 0.38, 0, Math.PI * 2)
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

    // 玩家（位置由镜头钳制保证恒在安全区内）
    const px = this.playerX
    const py = this.toScreenY(this.playerY)
    const invincible = performance.now() < this.invincibleUntil
    if (!(invincible && Math.floor(ts / 110) % 2 === 0)) {
      ctx.save()
      ctx.translate(px, py)
      ctx.fillStyle = '#d62828'
      ctx.beginPath()
      ctx.arc(0, 2, PLAYER_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath()
      ctx.arc(0, -3.5, 7.6, 0, Math.PI * 2)
      ctx.fill()
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
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(-2.6, -3.8, 1.15, 0, Math.PI * 2)
      ctx.arc(2.6, -3.8, 1.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 接近画面下沿时的危险提示（安全区钳制下仅作氛围）
    const danger = (this.playerY - this.camY) / GAME_H
    if (danger < 0.2) {
      const g2 = ctx.createLinearGradient(0, GAME_H - 60, 0, GAME_H)
      g2.addColorStop(0, 'rgba(230,57,70,0)')
      g2.addColorStop(1, `rgba(230,57,70,${0.3 * (1 - danger / 0.2)})`)
      ctx.fillStyle = g2
      ctx.fillRect(0, GAME_H - 60, GAME_W, 60)
    }
  }
}
