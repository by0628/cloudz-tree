import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TreeCanvas from '../components/TreeCanvas'
import ShareBar, { treeInviteUrl } from '../components/ShareBar'
import GameScreen from '../game/GameScreen'
import { AvatarView } from './CreateTree'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import { checkContent } from '../lib/moderation'
import { fmtDate, timeAgo } from '../lib/format'
import { THEMES, type GameRecord, type Tree, type TreeMessage, type TreeStats, type Visit } from '../lib/types'

type Tab = 'msg' | 'rank' | 'visits'

export default function VisitTree() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? ''
  const me = getIdentity()
  const [tree, setTree] = useState<Tree | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [stats, setStats] = useState<TreeStats>({ visits: 0, plays: 0, bestScore: 0 })
  const [records, setRecords] = useState<GameRecord[]>([])
  const [messages, setMessages] = useState<TreeMessage[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [tab, setTab] = useState<Tab>('msg')
  const [playing, setPlaying] = useState(false)
  const [draft, setDraft] = useState('')
  const [msgError, setMsgError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const visitedRef = useRef(false)
  const gameRef = useRef<HTMLDivElement>(null)

  const loadAll = useCallback(async (treeId: string) => {
    const [s, r, m, v] = await Promise.all([
      db.stats(treeId),
      db.listRecords(treeId, 30),
      db.listMessages(treeId, 50),
      db.listVisits(treeId, 30),
    ])
    setStats(s)
    setRecords(r)
    setMessages(m)
    setVisits(v)
  }, [])

  useEffect(() => {
    visitedRef.current = false
    setPlaying(false)
    if (!id) {
      setStatus('missing')
      return
    }
    setStatus('loading')
    void (async () => {
      try {
        const t = await db.getTree(id)
        if (!t) {
          setStatus('missing')
          return
        }
        setTree(t)
        setStatus('ok')
        await loadAll(t.id)
        // 记录访问（同一会话同一棵树只记一次；树主本人不计）
        const guardKey = `cloudztree.visited.${t.id}`
        if (me.id !== t.ownerId && !sessionStorage.getItem(guardKey) && !visitedRef.current) {
          visitedRef.current = true
          sessionStorage.setItem(guardKey, '1')
          await db.recordVisit({ treeId: t.id, visitorId: me.id, visitorNickname: me.nickname })
          await loadAll(t.id)
        }
      } catch {
        setStatus('error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadAll])

  const startPlay = () => {
    setPlaying(true)
    requestAnimationFrame(() => gameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const closeGame = () => {
    setPlaying(false)
    if (tree) void loadAll(tree.id)
  }

  const sendMessage = async () => {
    if (!tree) return
    const check = checkContent(draft)
    if (!check.ok) {
      setMsgError(check.reason ?? '内容不合适')
      return
    }
    setSending(true)
    setMsgError(null)
    try {
      const msg = await db.addMessage({ treeId: tree.id, authorId: me.id, authorNickname: me.nickname, content: draft.trim() })
      setMessages((prev) => [msg, ...prev])
      setDraft('')
    } catch {
      setMsgError('发送失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  const removeMessage = async (m: TreeMessage) => {
    if (!window.confirm('删除这条留言？')) return
    try {
      await db.deleteMessage(m.id, me.id)
      setMessages((prev) => prev.filter((x) => x.id !== m.id))
    } catch {
      setMsgError('删除失败，请重试')
    }
  }

  const report = async (m: TreeMessage) => {
    if (!window.confirm('举报这条留言？被多次举报的留言会被自动隐藏。')) return
    try {
      await db.reportMessage(m.id)
      if (tree) setMessages(await db.listMessages(tree.id, 50))
    } catch {
      setMsgError('举报失败，请重试')
    }
  }

  if (status === 'loading') {
    return <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center text-frost-300">正在赶往这棵树… 🎄</div>
  }
  if (status === 'missing') {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl">🌌</div>
        <h1 className="mt-3 text-xl font-bold">这棵树不见了</h1>
        <p className="mt-2 text-sm leading-relaxed text-frost-300">
          链接里的树 ID 不存在，可能输错了，或者树主已经把它删掉。
          <br />
          你可以自己种一棵，邀好友来爬。
        </p>
        <Link to="/create" className="btn-gold mt-5 inline-block rounded-2xl px-6 py-3 font-bold">种我的圣诞树</Link>
      </div>
    )
  }
  if (status === 'error' || !tree) {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl">📡</div>
        <h1 className="mt-3 text-xl font-bold">网络开小差了</h1>
        <p className="mt-2 text-sm text-frost-300">加载这棵树失败，检查一下网络再刷新试试。</p>
        <button onClick={() => window.location.reload()} className="btn-gold mt-5 rounded-2xl px-6 py-3 font-bold">刷新重试</button>
      </div>
    )
  }

  const isOwner = me.id === tree.ownerId

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* 树主与树 */}
      <section className="text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-center gap-2.5">
            <AvatarView avatar={tree.ownerAvatar} size={44} />
            <div className="text-left">
              <div className="font-bold leading-tight">{tree.ownerNickname}</div>
              <div className="text-xs text-frost-300">
                {THEMES[tree.theme].label} · {fmtDate(tree.createdAt)} 种下
              </div>
            </div>
          </div>
          <h1 className="mt-3 text-3xl font-black">「{tree.name}」</h1>
          <p className="mt-1 text-sm text-frost-300">{isOwner ? '这是你的树，把链接发给好友等他们来爬吧' : `${tree.ownerNickname} 邀你来爬树，你能爬多高？`}</p>
        </motion.div>

        <div className="mx-auto w-60 max-w-[75vw]">
          <TreeCanvas theme={tree.theme} />
        </div>

        <div className="mx-auto grid max-w-sm grid-cols-3 gap-2 text-center">
          {[
            { label: '来访', value: stats.visits },
            { label: '对局', value: stats.plays },
            { label: '最高分', value: stats.bestScore },
          ].map((s) => (
            <div key={s.label} className="glass rounded-2xl px-2 py-2.5">
              <div className="text-lg font-black text-gold-300">{s.value}</div>
              <div className="text-[11px] text-frost-300">{s.label}</div>
            </div>
          ))}
        </div>

        <div ref={gameRef} className="mt-4 scroll-mt-24">
          {!playing ? (
            <button onClick={startPlay} className="btn-gold w-full max-w-sm rounded-2xl py-4 text-lg font-bold">
              🧗 开始爬树
            </button>
          ) : (
            <GameScreen tree={tree} onClose={closeGame} />
          )}
        </div>
      </section>

      {/* 分享 */}
      <section className="glass rounded-3xl p-4">
        <div className="mb-2 text-sm font-bold">📣 邀更多人来爬这棵树</div>
        <ShareBar url={treeInviteUrl(tree.id)} title={`圣诞树「${tree.name}」`} />
      </section>

      {/* 互动区 */}
      <section className="glass rounded-3xl p-4">
        <div className="mb-3 flex gap-2">
          {(
            [
              { key: 'msg', label: `💌 留言 ${messages.length}` },
              { key: 'rank', label: `🏆 成绩榜` },
              { key: 'visits', label: `👣 访客 ${stats.visits}` },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-gold-400/25 text-gold-300 ring-1 ring-gold-400/50' : 'bg-white/6 text-frost-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'msg' && (
            <motion.div key="msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
                  maxLength={200}
                  placeholder={`以「${me.nickname}」的身份留句话…`}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm outline-none placeholder:text-frost-300/50 focus:border-gold-400/60"
                />
                <button onClick={() => void sendMessage()} disabled={sending} className="btn-gold shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60">
                  {sending ? '发送中' : '发送'}
                </button>
              </div>
              {msgError && <p className="mt-2 text-xs text-red-300">{msgError}</p>}
              <div className="nice-scroll mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {messages.length === 0 && <p className="py-6 text-center text-sm text-frost-300">树下还很安静，来留第一句话吧。</p>}
                {messages.map((m) => (
                  <div key={m.id} className="rounded-2xl bg-white/5 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {m.authorNickname}
                        {m.authorId === tree.ownerId && <span className="ml-1.5 rounded bg-gold-400/25 px-1.5 py-0.5 text-[10px] text-gold-300">树主</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-frost-300/70">
                        {timeAgo(m.createdAt)}
                        {m.authorId === me.id ? (
                          <button onClick={() => void removeMessage(m)} className="text-red-300/90">删除</button>
                        ) : (
                          <button onClick={() => void report(m)} className="text-frost-300/80">举报</button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {tab === 'rank' && (
            <motion.div key="rank" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {records.length === 0 ? (
                <p className="py-6 text-center text-sm text-frost-300">还没有人爬过这棵树，来拿下第一名！</p>
              ) : (
                <ol className="space-y-1.5">
                  {records.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                      <span className={`w-7 shrink-0 text-center font-black ${i === 0 ? 'text-gold-300' : i === 1 ? 'text-frost-100' : i === 2 ? 'text-amber-500' : 'text-frost-300/60'}`}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {r.playerNickname}
                        {r.playerId === me.id && <span className="ml-1 text-xs text-gold-300">(我)</span>}
                      </span>
                      <span className="shrink-0 text-xs text-frost-300">{r.heightM.toFixed(1)}m · ⭐{r.stars}</span>
                      <span className="w-16 shrink-0 text-right font-bold text-gold-300">{r.score}</span>
                    </li>
                  ))}
                </ol>
              )}
            </motion.div>
          )}

          {tab === 'visits' && (
            <motion.div key="visits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {visits.length === 0 ? (
                <p className="py-6 text-center text-sm text-frost-300">还没有访客记录，快把链接分享出去吧。</p>
              ) : (
                <ul className="space-y-1.5">
                  {visits.map((v) => (
                    <li key={v.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                      <span className="font-medium">{v.visitorNickname}</span>
                      <span className="text-xs text-frost-300/70">{timeAgo(v.createdAt)} 来过</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <p className="text-center text-xs text-frost-300/60">
        想有自己的树？<Link to="/create" className="text-gold-300">点这里种一棵</Link>
      </p>
    </div>
  )
}
