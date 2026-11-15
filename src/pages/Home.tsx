import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import TreeCanvas from '../components/TreeCanvas'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import { timeAgo } from '../lib/format'
import type { Tree } from '../lib/types'

function extractTreeId(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const u = new URL(text)
    const id = u.searchParams.get('id')
    if (id) return id
  } catch {
    /* 不是完整 URL，按 ID 处理 */
  }
  return text
}

export default function Home() {
  const navigate = useNavigate()
  const [invite, setInvite] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Tree[]>([])
  const [mine, setMine] = useState<Tree[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const me = getIdentity()
    void (async () => {
      try {
        const [r, m] = await Promise.all([db.recentTrees(6), db.listTreesByOwner(me.id)])
        setRecent(r)
        setMine(m)
      } catch {
        setLoadError('数据加载失败，请检查网络后刷新')
      }
    })()
  }, [])

  const goInvite = () => {
    const id = extractTreeId(invite)
    if (!id) {
      setInviteError('先粘贴好友的邀请链接或树 ID')
      return
    }
    navigate(`/tree/visit?id=${encodeURIComponent(id)}`)
  }

  return (
    <div className="space-y-8">
      {/* 主视觉 */}
      <section className="relative overflow-hidden rounded-[2rem] px-5 pb-6 pt-8 text-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-sm tracking-[0.35em] text-gold-300">CLOUDZ TREE</div>
          <h1 className="mt-2 text-4xl font-black leading-tight">
            种一棵圣诞树
            <br />
            <span className="text-gold-300">邀好友来爬</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-frost-300">
            创建你的专属圣诞树，生成邀请链接发给好友——他们来爬树、冲榜、给你留言，你能爬多高？
          </p>
        </motion.div>
        <motion.div
          className="floaty mx-auto -mt-1 w-56 max-w-[70vw]"
          initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}
        >
          <TreeCanvas theme="classic" />
        </motion.div>
        <div className="mt-2 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/create" className="btn-gold w-full rounded-2xl px-8 py-3.5 text-lg font-bold sm:w-auto">
            🎄 创建我的圣诞树
          </Link>
          <Link to="/leaderboard" className="btn-ghost w-full rounded-2xl px-8 py-3.5 font-medium sm:w-auto">
            🏆 看排行榜
          </Link>
        </div>
      </section>

      {/* 用邀请链接访问 */}
      <section className="glass rounded-3xl p-5">
        <h2 className="font-bold">有好友的邀请链接？</h2>
        <p className="mt-1 text-sm text-frost-300">粘贴链接（或直接填树 ID），马上到他的树下。</p>
        <div className="mt-3 flex gap-2">
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="粘贴邀请链接 / 树 ID"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3.5 py-3 text-sm outline-none placeholder:text-frost-300/50 focus:border-gold-400/60"
          />
          <button onClick={goInvite} className="btn-gold shrink-0 rounded-xl px-5 py-3 font-bold">
            出发
          </button>
        </div>
        {inviteError && <p className="mt-2 text-xs text-red-300">{inviteError}</p>}
      </section>

      {/* 玩法 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: '🌱', title: '种树邀友', desc: '选主题、起名字，生成你的专属邀请链接，一键分享给好友。', to: '/create' },
          { icon: '❓', title: '你有多了解我', desc: '出一份只属于你的问答，邀朋友来答，看谁是最懂你的那个人。', to: '/quiz' },
          { icon: '🧗', title: '攀爬比拼', desc: '在好友的树上向上爬，躲雪球、摘星星，爬到 100 米树顶登顶。', to: '/leaderboard' },
          { icon: '💌', title: '留言互动', desc: '在树下留一句话，访客和成绩都会被记下来，热热闹闹过圣诞。', to: '/profile' },
        ].map((c, i) => (
          <motion.div
            key={c.title}
            className="glass rounded-3xl p-5"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
          >
            <div className="text-2xl">{c.icon}</div>
            <h3 className="mt-2 font-bold">{c.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-frost-300">{c.desc}</p>
            <Link to={c.to} className="mt-2 inline-block text-sm text-gold-300">去看看 ›</Link>
          </motion.div>
        ))}
      </section>

      {loadError && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">{loadError}</p>}

      {/* 我的树 */}
      {mine.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">我的圣诞树</h2>
            <Link to="/profile" className="text-sm text-gold-300">个人中心 ›</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((t) => (
              <TreeCard key={t.id} tree={t} />
            ))}
          </div>
        </section>
      )}

      {/* 最新圣诞树 */}
      <section>
        <h2 className="mb-3 font-bold">🌲 最新种下的树</h2>
        {recent.length === 0 && !loadError ? (
          <div className="glass rounded-3xl p-8 text-center text-sm text-frost-300">还没有人种树，来种第一棵吧。</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((t) => (
              <TreeCard key={t.id} tree={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function TreeCard({ tree }: { tree: Tree }) {
  return (
    <Link to={`/tree/visit?id=${encodeURIComponent(tree.id)}`} className="glass group flex items-center gap-4 rounded-3xl p-4 transition hover:bg-white/10">
      <div className="w-16 shrink-0">
        <TreeCanvas theme={tree.theme} animated={false} />
      </div>
      <div className="min-w-0">
        <div className="truncate font-bold">{tree.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-frost-300">
          <span className="text-base">{tree.ownerAvatar}</span>
          <span className="truncate">{tree.ownerNickname}</span>
          <span className="shrink-0 text-xs text-frost-300/60">· {timeAgo(tree.createdAt)}</span>
        </div>
        <div className="mt-1 text-xs text-gold-300">去爬这棵树 ›</div>
      </div>
    </Link>
  )
}
