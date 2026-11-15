import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import { fmtDate } from '../lib/format'
import type { GameRecord, Tree } from '../lib/types'
import { TreeCard } from './Home'

export default function Leaderboard() {
  const me = getIdentity()
  const [records, setRecords] = useState<GameRecord[]>([])
  const [trees, setTrees] = useState<Map<string, Tree>>(new Map())
  const [recent, setRecent] = useState<Tree[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [top, recentTrees] = await Promise.all([db.topRecords(null, 50), db.recentTrees(30)])
        setRecords(top)
        setRecent(recentTrees.slice(0, 6))
        const map = new Map(recentTrees.map((t) => [t.id, t]))
        const missing = [...new Set(top.map((r) => r.treeId))].filter((tid) => !map.has(tid))
        await Promise.all(
          missing.map(async (tid) => {
            const t = await db.getTree(tid)
            if (t) map.set(tid, t)
          }),
        )
        setTrees(new Map(map))
      } catch {
        setError('排行榜加载失败，请检查网络后刷新')
      }
    })()
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-black">🏆 攀爬排行榜</h1>
        <p className="mt-1 text-sm text-frost-300">全场最高分都在这里，来把第一名拉下马。</p>
      </div>

      {error && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">{error}</p>}

      <section className="glass rounded-3xl p-4">
        {records.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-frost-300">榜上还没有成绩，去爬一棵树，第一个上榜！</p>
        ) : (
          <ol className="space-y-1.5">
            {records.map((r, i) => {
              const t = trees.get(r.treeId)
              return (
                <li key={r.id}>
                  <Link
                    to={`/tree/visit?id=${encodeURIComponent(r.treeId)}`}
                    className="flex items-center gap-3 rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm transition hover:bg-white/10"
                  >
                    <span className={`w-7 shrink-0 text-center text-base font-black ${i === 0 ? 'text-gold-300' : i === 1 ? 'text-frost-100' : i === 2 ? 'text-amber-500' : 'text-frost-300/60'}`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {r.playerNickname}
                        {r.playerId === me.id && <span className="ml-1 text-xs text-gold-300">(我)</span>}
                      </span>
                      <span className="block truncate text-xs text-frost-300/80">
                        在「{t?.name ?? '某棵树'}」· {fmtDate(r.createdAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-frost-300">{r.heightM.toFixed(1)}m · ⭐{r.stars}</span>
                    <span className="w-16 shrink-0 text-right font-bold text-gold-300">{r.score}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-bold">🌲 最近种下的树</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {recent.map((t) => (
            <TreeCard key={t.id} tree={t} />
          ))}
        </div>
      </section>
    </div>
  )
}
