import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ShareBar, { treeInviteUrl } from '../components/ShareBar'
import { AvatarView } from './CreateTree'
import { db } from '../lib/db'
import { getIdentity, saveIdentity } from '../lib/identity'
import { checkNickname } from '../lib/moderation'
import { timeAgo } from '../lib/format'
import { AVATARS, THEMES, quizTier, type GameRecord, type QuizAttempt, type QuizProfile, type Tree, type TreeMessage, type TreeStats, type Visit } from '../lib/types'

interface TreeWithStats {
  tree: Tree
  stats: TreeStats
}

export default function Profile() {
  const [identity, setIdentity] = useState(getIdentity())
  const [nickname, setNickname] = useState(identity.nickname)
  const [avatar, setAvatar] = useState(identity.avatar)
  const [savedTip, setSavedTip] = useState<string | null>(null)
  const [myTrees, setMyTrees] = useState<TreeWithStats[]>([])
  const [myQuiz, setMyQuiz] = useState<QuizProfile | null>(null)
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [takenQuizzes, setTakenQuizzes] = useState<(QuizAttempt & { quizTitle: string })[]>([])
  const [myRecords, setMyRecords] = useState<GameRecord[]>([])
  const [inbox, setInbox] = useState<(TreeMessage & { treeName: string })[]>([])
  const [guestbook, setGuestbook] = useState<(Visit & { treeName: string })[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = async (uid: string) => {
    const [trees, records, msgs, visits] = await Promise.all([
      db.listTreesByOwner(uid),
      db.myRecords(uid, 30),
      db.messagesForOwner(uid, 20),
      db.visitsForOwner(uid, 20),
    ])
    const withStats = await Promise.all(
      trees.map(async (tree) => ({ tree, stats: await db.stats(tree.id) })),
    )
    setMyTrees(withStats)
    setMyRecords(records)
    setInbox(msgs)
    setGuestbook(visits)
    const quiz = await db.getQuizProfileByOwner(uid).catch(() => null)
    setMyQuiz(quiz)
    if (quiz) setQuizAttempts(await db.listQuizAttempts(quiz.id, 10).catch(() => []))
    const taken = await db.myQuizAttempts(uid, 10).catch(() => [])
    const titled = await Promise.all(
      taken.map(async (a) => {
        const p = await db.getQuizProfile(a.profileId).catch(() => null)
        return { ...a, quizTitle: p?.title ?? '一份问答' }
      }),
    )
    setTakenQuizzes(titled)
  }

  useEffect(() => {
    load(identity.id).catch(() => setError('数据加载失败，请检查网络后刷新'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveProfile = () => {
    const check = checkNickname(nickname)
    if (!check.ok) {
      setSavedTip(check.reason ?? '昵称不合适')
      return
    }
    const next = { id: identity.id, nickname: nickname.trim(), avatar }
    saveIdentity(next)
    setIdentity(next)
    setSavedTip('已保存（新种的树和新留言会用新资料）')
    window.setTimeout(() => setSavedTip(null), 2600)
  }

  const removeTree = async (t: Tree) => {
    if (!window.confirm(`删除「${t.name}」？它的成绩、留言和访客记录会一起删除。`)) return
    try {
      await db.deleteTree(t.id, identity.id)
      setMyTrees((prev) => prev.filter((x) => x.tree.id !== t.id))
    } catch {
      setError('删除失败，请重试')
    }
  }

  const best = myRecords.reduce((m, r) => Math.max(m, r.score), 0)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-center text-2xl font-black">个人中心</h1>
      {error && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">{error}</p>}

      {/* 资料 */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <AvatarView avatar={avatar} size={52} />
          <div>
            <div className="font-bold">{identity.nickname}</div>
            <div className="text-xs text-frost-300">历史最高分 {best} · 共 {myRecords.length} 局记录</div>
          </div>
        </div>
        <div>
          <label className="text-sm text-frost-300">昵称</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm outline-none focus:border-gold-400/60"
          />
        </div>
        <div>
          <label className="text-sm text-frost-300">头像</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${avatar === a ? 'bg-gold-400/30 ring-2 ring-gold-400' : 'bg-white/8'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <button onClick={saveProfile} className="btn-gold w-full rounded-xl py-2.5 font-bold">保存资料</button>
        {savedTip && <p className="text-center text-xs text-gold-300">{savedTip}</p>}
      </section>

      {/* 我的树 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">🌲 我种的树（{myTrees.length}）</h2>
          <Link to="/create" className="btn-ghost rounded-xl px-3.5 py-1.5 text-sm">+ 种新树</Link>
        </div>
        {myTrees.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-sm text-frost-300">
            还没种过树。<Link to="/create" className="text-gold-300">去种第一棵 ›</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myTrees.map(({ tree, stats }) => (
              <div key={tree.id} className="glass rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/tree/visit?id=${tree.id}`} className="min-w-0">
                    <div className="truncate font-bold">{tree.name}</div>
                    <div className="text-xs text-frost-300">
                      {THEMES[tree.theme].label} · 来访 {stats.visits} · 对局 {stats.plays} · 最高 {stats.bestScore} 分
                    </div>
                  </Link>
                  <button onClick={() => void removeTree(tree)} className="btn-ghost shrink-0 rounded-xl px-3 py-1.5 text-xs text-red-300">
                    删除
                  </button>
                </div>
                <div className="mt-3">
                  <ShareBar url={treeInviteUrl(tree.id)} title={`我的圣诞树「${tree.name}」`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 我的问答 */}
      <section className="glass rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">❓ 我的问答</h2>
          <Link to="/quiz" className="btn-ghost rounded-xl px-3.5 py-1.5 text-sm">{myQuiz ? '管理问答' : '+ 出一份问答'}</Link>
        </div>
        {myQuiz ? (
          <>
            <div className="text-sm">
              <span className="font-medium">{myQuiz.title}</span>
              <span className="text-xs text-frost-300"> · 已收到 {quizAttempts.length} 份答卷</span>
            </div>
            {quizAttempts.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {quizAttempts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium">{a.takerNickname}</span>
                    <span className="shrink-0 text-xs text-frost-300">{quizTier(a.total ? a.score / a.total : 0).title}</span>
                    <span className="shrink-0 font-bold text-gold-300">{a.score}/{a.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="py-2 text-sm text-frost-300">还没有问答。出 10 道题邀朋友来答，看谁最懂你。</p>
        )}
        {takenQuizzes.length > 0 && (
          <>
            <h3 className="mb-2 mt-4 text-sm font-bold text-frost-300">我答过的问答</h3>
            <ul className="space-y-1.5">
              {takenQuizzes.map((a) => (
                <li key={a.id}>
                  <Link to={`/quiz/take?id=${a.profileId}`} className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm hover:bg-white/10">
                    <span className="min-w-0 truncate">{a.quizTitle}</span>
                    <span className="shrink-0 font-bold text-gold-300">{a.score}/{a.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 我的成绩 */}
      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-bold">🧗 我的攀爬记录</h2>
        {myRecords.length === 0 ? (
          <p className="py-4 text-center text-sm text-frost-300">还没有成绩，去爬一棵树试试。</p>
        ) : (
          <ul className="space-y-1.5">
            {myRecords.map((r) => (
              <li key={r.id}>
                <Link to={`/tree/visit?id=${r.treeId}`} className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm hover:bg-white/10">
                  <span className="text-frost-300">{timeAgo(r.createdAt)}</span>
                  <span className="text-xs text-frost-300">{r.heightM.toFixed(1)}m · ⭐{r.stars}</span>
                  <span className="font-bold text-gold-300">{r.score} 分</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 收到的互动 */}
      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-bold">💌 我的树收到的留言</h2>
        {inbox.length === 0 ? (
          <p className="py-4 text-center text-sm text-frost-300">暂时没有留言，把链接发给好友吧。</p>
        ) : (
          <ul className="space-y-2">
            {inbox.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                <span className="font-medium">{m.authorNickname}</span>
                <span className="text-xs text-frost-300"> 在「{m.treeName}」说 · {timeAgo(m.createdAt)}</span>
                <p className="mt-0.5 break-words">{m.content}</p>
              </li>
            ))}
          </ul>
        )}
        <h2 className="mb-3 mt-5 font-bold">👣 最近访客</h2>
        {guestbook.length === 0 ? (
          <p className="py-4 text-center text-sm text-frost-300">暂时没有访客。</p>
        ) : (
          <ul className="space-y-1.5">
            {guestbook.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                <span className="font-medium">{v.visitorNickname}</span>
                <span className="text-xs text-frost-300">访问了「{v.treeName}」· {timeAgo(v.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
