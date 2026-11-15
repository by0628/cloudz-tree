import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClimbEngine, GAME_H, GAME_W, type GameResult, type HudState } from './engine'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import type { Tree } from '../lib/types'

type Phase = 'ready' | 'playing' | 'paused' | 'over'

export default function GameScreen({ tree, onClose }: { tree: Tree; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ClimbEngine | null>(null)
  const submittedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('ready')
  const [hud, setHud] = useState<HudState>({ score: 0, heightM: 0, stars: 0, hearts: 3 })
  const [result, setResult] = useState<GameResult | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const phaseRef = useRef<Phase>('ready')
  phaseRef.current = phase

  const createEngine = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    engineRef.current?.destroy()
    submittedRef.current = false
    const engine = new ClimbEngine(canvas, tree.theme, {
      onHud: (h) => setHud(h),
      onGameOver: (r) => {
        setResult(r)
        setPhase('over')
        if (submittedRef.current) return
        submittedRef.current = true
        const me = getIdentity()
        void (async () => {
          try {
            await db.addRecord(tree.id, me.id, me.nickname, r)
            const top = await db.listRecords(tree.id, 100)
            const myRank = top.filter((x) => x.score > r.score).length + 1
            setRank(myRank)
          } catch {
            setSubmitError('成绩保存失败（网络问题），分数只记在了本屏上')
          }
        })()
      },
    })
    engineRef.current = engine
  }, [tree.id, tree.theme])

  useEffect(() => {
    createEngine()
    return () => engineRef.current?.destroy()
  }, [createEngine])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phaseRef.current === 'playing') {
        engineRef.current?.setPaused(true)
        setPhase('paused')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const startGame = () => {
    setResult(null)
    setRank(null)
    setSubmitError(null)
    engineRef.current?.start()
    setPhase('playing')
  }

  const restart = () => {
    createEngine()
    setResult(null)
    setRank(null)
    setSubmitError(null)
    requestAnimationFrame(() => {
      engineRef.current?.start()
      setPhase('playing')
    })
  }

  const pauseGame = () => {
    engineRef.current?.setPaused(true)
    setPhase('paused')
  }
  const resumeGame = () => {
    engineRef.current?.setPaused(false)
    setPhase('playing')
  }

  const hold = (d: -1 | 0 | 1) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      engineRef.current?.setDir(d)
    },
    onPointerUp: () => engineRef.current?.setDir(0),
    onPointerLeave: () => engineRef.current?.setDir(0),
    onPointerCancel: () => engineRef.current?.setDir(0),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  return (
    <div className="relative mx-auto w-full max-w-[420px] select-none">
      <div className="relative overflow-hidden rounded-3xl border border-white/15 shadow-2xl">
        <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: `${GAME_W} / ${GAME_H}`, touchAction: 'none', display: 'block' }} />

        {/* HUD */}
        {(phase === 'playing' || phase === 'paused') && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <div className="rounded-2xl bg-black/35 px-3 py-1.5 text-sm backdrop-blur-sm">
              <div className="font-bold text-gold-300">{hud.score} 分</div>
              <div className="text-[11px] text-frost-300">高度 {hud.heightM.toFixed(1)}m · ⭐ {hud.stars}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-black/35 px-2.5 py-1.5 text-sm backdrop-blur-sm">
                {'❤️'.repeat(hud.hearts)}
                {'🖤'.repeat(Math.max(0, 3 - hud.hearts))}
              </div>
              {phase === 'playing' && (
                <button onClick={pauseGame} className="btn-ghost pointer-events-auto rounded-2xl px-3 py-1.5 text-sm" aria-label="暂停">
                  ⏸
                </button>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {phase === 'ready' && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-midnight-950/70 p-6 text-center backdrop-blur-[2px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="text-4xl">🎄</div>
              <h3 className="text-xl font-bold">爬上「{tree.name}」</h3>
              <p className="text-sm leading-relaxed text-frost-300">
                按住屏幕左 / 右半边（或用 ◀ ▶ 键）左右移动
                <br />躲开横树枝和掉落的雪球，收集星星 ⭐
                <br />被砸中或掉出画面都会掉一颗心，3 颗心用完结束
              </p>
              <button onClick={startGame} className="btn-gold mt-2 rounded-2xl px-8 py-3 text-lg font-bold">
                开始攀爬
              </button>
              <button onClick={onClose} className="text-sm text-frost-300 underline-offset-2 hover:underline">
                先不玩了
              </button>
            </motion.div>
          )}

          {phase === 'paused' && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-midnight-950/70 p-6 text-center backdrop-blur-[2px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="text-3xl">⏸ 已暂停</div>
              <button onClick={resumeGame} className="btn-gold rounded-2xl px-8 py-3 font-bold">继续攀爬</button>
              <button onClick={restart} className="btn-ghost rounded-2xl px-6 py-2.5 text-sm">重新开始</button>
              <button onClick={onClose} className="text-sm text-frost-300 underline-offset-2 hover:underline">退出游戏</button>
            </motion.div>
          )}

          {phase === 'over' && result && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-midnight-950/75 p-6 text-center backdrop-blur-[2px]"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            >
              <div className="text-4xl">🏁</div>
              <h3 className="text-xl font-bold">攀爬结束！</h3>
              <div className="glass rounded-2xl px-6 py-3">
                <div className="text-3xl font-black text-gold-300">{result.score} 分</div>
                <div className="mt-1 text-sm text-frost-300">
                  爬高 {result.heightM.toFixed(1)} 米 · 收集 ⭐ {result.stars}
                </div>
                {rank !== null && <div className="mt-1 text-sm text-gold-400">在这棵树上排名第 {rank} 名</div>}
                {submitError && <div className="mt-1 text-xs text-red-300">{submitError}</div>}
              </div>
              <button onClick={restart} className="btn-gold mt-1 rounded-2xl px-8 py-3 font-bold">再来一局</button>
              <button onClick={onClose} className="btn-ghost rounded-2xl px-6 py-2.5 text-sm">回到树下看看</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 触摸方向键 */}
      {phase === 'playing' && (
        <div className="mt-3 flex items-center justify-between px-1">
          <button {...hold(-1)} className="btn-ghost flex h-16 w-28 items-center justify-center rounded-3xl text-3xl" aria-label="向左">
            ◀
          </button>
          <div className="text-xs text-frost-300">按住移动</div>
          <button {...hold(1)} className="btn-ghost flex h-16 w-28 items-center justify-center rounded-3xl text-3xl" aria-label="向右">
            ▶
          </button>
        </div>
      )}
    </div>
  )
}
