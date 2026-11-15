import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import ShareBar, { quizInviteUrl } from '../components/ShareBar'
import { AvatarView } from './CreateTree'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import { checkContent } from '../lib/moderation'
import { timeAgo } from '../lib/format'
import { quizTier, type QuizAttempt, type QuizAttemptResult, type QuizProfile } from '../lib/types'

interface EditOption {
  text: string
  imageUrl: string
}
interface EditQuestion {
  key: string
  text: string
  imageUrl: string
  options: EditOption[]
  correctIndex: number
}

const MAX_QUESTIONS = 20
const MIN_QUESTIONS = 3

/** 默认 10 道模板题：出题人把选项与正确答案改成自己的再分享 */
const TEMPLATE: { text: string; options: string[] }[] = [
  { text: '我最喜欢的颜色是？', options: ['宝蓝色', '奶油白', '樱花粉', '薄荷绿'] },
  { text: '我最爱喝的饮品是？', options: ['热可可', '珍珠奶茶', '冰美式', '柠檬水'] },
  { text: '我最喜欢的季节是？', options: ['春天', '夏天', '秋天', '冬天'] },
  { text: '休息日我最可能在做什么？', options: ['睡到自然醒', '出门逛街', '打游戏', '看书追剧'] },
  { text: '我最喜欢的食物是？', options: ['火锅', '寿司', '炸鸡', '饺子'] },
  { text: '我的性格更像哪种小动物？', options: ['猫咪', '小狗', '仓鼠', '企鹅'] },
  { text: '我最想去旅行的地方是？', options: ['海边小镇', '雪山脚下', '繁华都市', '古镇老街'] },
  { text: '我平时是早睡还是晚睡？', options: ['早睡早起', '夜猫子', '随缘作息', '周末补觉型'] },
  { text: '我最喜欢的电影类型是？', options: ['喜剧', '科幻', '动画', '悬疑'] },
  { text: '收到礼物时，我最在意什么？', options: ['心意最重要', '实用就好', '惊喜感', '包装要好看'] },
]

const templateQuestions = (): EditQuestion[] =>
  TEMPLATE.map((t) => ({
    key: nanoid(6),
    text: t.text,
    imageUrl: '',
    options: t.options.map((text) => ({ text, imageUrl: '' })),
    correctIndex: 0,
  }))

const blankQuestion = (): EditQuestion => ({
  key: nanoid(6),
  text: '',
  imageUrl: '',
  options: [
    { text: '', imageUrl: '' },
    { text: '', imageUrl: '' },
    { text: '', imageUrl: '' },
    { text: '', imageUrl: '' },
  ],
  correctIndex: 0,
})

const validImageUrl = (u: string) => u === '' || (u.startsWith('https://') && u.length <= 500)

export default function QuizEdit() {
  const me = getIdentity()
  const [status, setStatus] = useState<'loading' | 'none' | 'edit' | 'error'>('loading')
  const [profile, setProfile] = useState<QuizProfile | null>(null)
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [questions, setQuestions] = useState<EditQuestion[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [reviews, setReviews] = useState<Record<string, QuizAttemptResult>>({})
  const [tip, setTip] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try {
      const p = await db.getQuizProfileByOwner(me.id)
      if (!p) {
        setStatus('none')
        return
      }
      setProfile(p)
      setTitle(p.title)
      setIntro(p.intro)
      const [qs, atts] = await Promise.all([db.listMyQuizQuestions(p.id), db.listQuizAttempts(p.id, 50)])
      setQuestions(
        qs.map((q) => ({
          key: q.id,
          text: q.text,
          imageUrl: q.imageUrl ?? '',
          options: q.options.map((o) => ({ text: o.text, imageUrl: o.imageUrl ?? '' })),
          correctIndex: q.correctIndex,
        })),
      )
      setAttempts(atts)
      setStatus('edit')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flash = (msg: string) => {
    setTip(msg)
    window.setTimeout(() => setTip(null), 3000)
  }

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const p = await db.saveQuizProfile({
        id: nanoid(8),
        ownerId: me.id,
        ownerNickname: me.nickname,
        ownerAvatar: me.avatar,
        title: `你有多了解${me.nickname}？`,
        intro: '凭直觉选就好，答完会有一份专属的「了解程度报告」等你。',
      })
      const qs = templateQuestions()
      await db.saveQuizQuestions(
        p.id,
        qs.map((q) => ({
          text: q.text,
          imageUrl: undefined,
          options: q.options.map((o) => ({ text: o.text })),
          correctIndex: q.correctIndex,
        })),
      )
      setProfile(p)
      setTitle(p.title)
      setIntro(p.intro)
      setQuestions(qs)
      setStatus('edit')
      flash('问答已创建！先把每道题的正确答案改成你自己的，再分享给好友')
    } catch {
      setError('创建失败，请检查网络后重试')
    } finally {
      setCreating(false)
    }
  }

  const saveProfile = async () => {
    if (!profile) return
    const t = title.trim()
    if (!t) return setError('标题不能为空')
    const c = checkContent(t)
    if (!c.ok) return setError(c.reason ?? '标题不合适')
    if (intro.trim()) {
      const ci = checkContent(intro.trim())
      if (!ci.ok) return setError(ci.reason ?? '介绍不合适')
    }
    setSaving(true)
    setError(null)
    try {
      const p = await db.saveQuizProfile({
        id: profile.id, ownerId: me.id, ownerNickname: me.nickname, ownerAvatar: me.avatar,
        title: t, intro: intro.trim(),
      })
      setProfile(p)
      flash('档案已保存')
    } catch {
      setError('保存失败，请检查网络后重试')
    } finally {
      setSaving(false)
    }
  }

  const saveQuestions = async () => {
    if (!profile) return
    if (questions.length < MIN_QUESTIONS) return setError(`至少出 ${MIN_QUESTIONS} 道题`)
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const label = `第 ${i + 1} 题`
      if (!q.text.trim()) return setError(`${label}还没写题目`)
      const cq = checkContent(q.text.trim())
      if (!cq.ok) return setError(`${label}：${cq.reason}`)
      if (!validImageUrl(q.imageUrl.trim())) return setError(`${label}的图片链接需以 https:// 开头（可留空）`)
      if (q.options.length < 2) return setError(`${label}至少要有 2 个选项`)
      for (const o of q.options) {
        if (!o.text.trim()) return setError(`${label}有选项还没填`)
        const co = checkContent(o.text.trim())
        if (!co.ok) return setError(`${label}选项：${co.reason}`)
        if (!validImageUrl(o.imageUrl.trim())) return setError(`${label}选项图片链接需以 https:// 开头（可留空）`)
      }
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return setError(`${label}还没选正确答案`)
    }
    setSaving(true)
    setError(null)
    try {
      await db.saveQuizQuestions(
        profile.id,
        questions.map((q) => ({
          text: q.text.trim(),
          imageUrl: q.imageUrl.trim() || undefined,
          options: q.options.map((o) => ({
            text: o.text.trim(),
            ...(o.imageUrl.trim() ? { imageUrl: o.imageUrl.trim() } : {}),
          })),
          correctIndex: q.correctIndex,
        })),
      )
      flash('题目已保存，好友现在答的就是新版本')
    } catch {
      setError('保存失败，请检查网络后重试')
    } finally {
      setSaving(false)
    }
  }

  const removeProfile = async () => {
    if (!profile) return
    if (!window.confirm('删除整个问答档案？题目和朋友们的答题记录会一起删除。')) return
    try {
      await db.deleteQuizProfile(profile.id, me.id)
      setProfile(null)
      setQuestions([])
      setAttempts([])
      setStatus('none')
    } catch {
      setError('删除失败，请重试')
    }
  }

  const toggleReview = async (a: QuizAttempt) => {
    if (reviews[a.id]) {
      setReviews((prev) => {
        const next = { ...prev }
        delete next[a.id]
        return next
      })
      return
    }
    try {
      const r = await db.getQuizReview(a.id)
      setReviews((prev) => ({ ...prev, [a.id]: r }))
    } catch {
      setError('这份答卷的详情加载失败（题目可能已被你改过）')
    }
  }

  const patchQ = (idx: number, patch: Partial<EditQuestion>) =>
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  const patchOpt = (qi: number, oi: number, patch: Partial<EditOption>) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : q)),
    )
  const moveQ = (idx: number, d: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev]
      const j = idx + d
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

  if (status === 'loading') {
    return <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center text-frost-300">正在打开你的问答小屋… ❓</div>
  }
  if (status === 'error') {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl">📡</div>
        <h1 className="mt-3 text-xl font-bold">网络开小差了</h1>
        <p className="mt-2 text-sm text-frost-300">加载问答失败，检查网络后刷新试试。</p>
        <button onClick={() => window.location.reload()} className="btn-gold mt-5 rounded-2xl px-6 py-3 font-bold">刷新重试</button>
      </div>
    )
  }

  if (status === 'none') {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <section className="glass rounded-3xl p-8 text-center">
          <div className="text-5xl">❓</div>
          <h1 className="mt-3 text-2xl font-black">你有多了解我？</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-frost-300">
            出一份只属于你的问答：默认 10 道模板题，改成你的答案，生成专属链接发给朋友——
            看看谁最懂你。答题成绩只有你和答题的朋友能看到。
          </p>
          <button onClick={() => void create()} disabled={creating} className="btn-gold mt-5 rounded-2xl px-8 py-3.5 text-lg font-bold disabled:opacity-60">
            {creating ? '创建中…' : '✨ 创建我的问答'}
          </button>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <p className="mt-4 text-xs text-frost-300/70">和爬树是两个独立玩法，也可以互相串门：答完题可以去爬你的树。</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-center text-2xl font-black">我的问答小屋</h1>
      {error && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">{error}</p>}
      {tip && <p className="rounded-2xl bg-gold-400/15 px-4 py-3 text-center text-sm text-gold-300">{tip}</p>}

      {/* 档案与分享 */}
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <AvatarView avatar={me.avatar} size={44} />
          <div>
            <div className="font-bold">{me.nickname} 的问答</div>
            <div className="text-xs text-frost-300">正确答案只有你能看到；好友的分数由服务器计算，改不了。</div>
          </div>
        </div>
        <div>
          <label className="text-sm text-frost-300">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm outline-none focus:border-gold-400/60"
          />
        </div>
        <div>
          <label className="text-sm text-frost-300">介绍（答题前给朋友看的话）</label>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            maxLength={200}
            rows={2}
            className="mt-1 w-full resize-none rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm outline-none focus:border-gold-400/60"
          />
        </div>
        <button onClick={() => void saveProfile()} disabled={saving} className="btn-ghost w-full rounded-xl py-2.5 font-bold disabled:opacity-60">
          保存档案
        </button>
        {profile && (
          <div>
            <div className="mb-2 text-sm font-bold">📣 把问答链接发给朋友</div>
            <ShareBar url={quizInviteUrl(profile.id)} title={profile.title} />
            <Link to={`/quiz/take?id=${profile.id}`} className="mt-2 inline-block text-xs text-frost-300 underline-offset-2 hover:underline">
              打开答题页看看效果 ›（你是出题人，只能预览不能答）
            </Link>
          </div>
        )}
      </section>

      {/* 题目编辑 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">📝 题目（{questions.length} / {MAX_QUESTIONS}）</h2>
          <button
            onClick={() => questions.length < MAX_QUESTIONS && setQuestions((prev) => [...prev, blankQuestion()])}
            className="btn-ghost rounded-xl px-3.5 py-1.5 text-sm"
          >
            + 添加题目
          </button>
        </div>
        {questions.map((q, qi) => (
          <div key={q.key} className="glass space-y-3 rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gold-300">第 {qi + 1} 题</span>
              <span className="flex gap-1.5 text-xs">
                <button onClick={() => moveQ(qi, -1)} className="btn-ghost rounded-lg px-2 py-1">↑</button>
                <button onClick={() => moveQ(qi, 1)} className="btn-ghost rounded-lg px-2 py-1">↓</button>
                <button
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                  className="btn-ghost rounded-lg px-2 py-1 text-red-300"
                >
                  删除
                </button>
              </span>
            </div>
            <input
              value={q.text}
              onChange={(e) => patchQ(qi, { text: e.target.value })}
              maxLength={120}
              placeholder="写下你的问题…"
              className="w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm outline-none focus:border-gold-400/60"
            />
            <input
              value={q.imageUrl}
              onChange={(e) => patchQ(qi, { imageUrl: e.target.value })}
              placeholder="题目配图链接（可选，https:// 开头）"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2 text-xs outline-none focus:border-gold-400/60"
            />
            <div className="space-y-2">
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <button
                    onClick={() => patchQ(qi, { correctIndex: oi })}
                    title="设为正确答案"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${q.correctIndex === oi ? 'bg-gold-400 font-black text-black' : 'bg-white/10 text-frost-300'}`}
                  >
                    {String.fromCharCode(65 + oi)}
                  </button>
                  <input
                    value={o.text}
                    onChange={(e) => patchOpt(qi, oi, { text: e.target.value })}
                    maxLength={60}
                    placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
                  />
                  <input
                    value={o.imageUrl}
                    onChange={(e) => patchOpt(qi, oi, { imageUrl: e.target.value })}
                    placeholder="图链接(可选)"
                    className="hidden w-28 rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-xs outline-none focus:border-gold-400/60 sm:block"
                  />
                  {q.options.length > 2 && (
                    <button
                      onClick={() =>
                        patchQ(qi, {
                          options: q.options.filter((_, j) => j !== oi),
                          correctIndex: q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex,
                        })
                      }
                      className="shrink-0 text-xs text-red-300/80"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-frost-300">
              <span>金色字母 = 正确答案（只有你看得到）</span>
              {q.options.length < 6 && (
                <button onClick={() => patchQ(qi, { options: [...q.options, { text: '', imageUrl: '' }] })} className="text-gold-300">
                  + 选项
                </button>
              )}
            </div>
          </div>
        ))}
        <button onClick={() => void saveQuestions()} disabled={saving} className="btn-gold w-full rounded-2xl py-3.5 font-bold disabled:opacity-60">
          {saving ? '保存中…' : '💾 保存全部题目'}
        </button>
      </section>

      {/* 答题结果 */}
      <section className="glass rounded-3xl p-4">
        <h2 className="mb-3 font-bold">📬 朋友们的答题结果（{attempts.length}）</h2>
        {attempts.length === 0 ? (
          <p className="py-4 text-center text-sm text-frost-300">还没有人来答，把上面的链接发给朋友吧。</p>
        ) : (
          <ul className="space-y-2">
            {attempts.map((a) => {
              const pct = a.total ? a.score / a.total : 0
              const review = reviews[a.id]
              return (
                <li key={a.id} className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm">
                  <button onClick={() => void toggleReview(a)} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="min-w-0 truncate font-medium">{a.takerNickname}</span>
                    <span className="shrink-0 text-xs text-frost-300">{quizTier(pct).title} · {timeAgo(a.createdAt)}</span>
                    <span className="shrink-0 font-bold text-gold-300">{a.score}/{a.total} 题</span>
                  </button>
                  {review && (
                    <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                      {review.review.map((r, i) => (
                        <div key={r.questionId} className="text-xs leading-relaxed text-frost-300">
                          <span className={r.chosen === r.correctIndex ? 'text-emerald-300' : 'text-red-300'}>
                            {r.chosen === r.correctIndex ? '✅' : '❌'}
                          </span>{' '}
                          {i + 1}. {r.text} —— TA 选了「{r.options[r.chosen]?.text ?? '—'}」
                          {r.chosen !== r.correctIndex && <>，正确答案「{r.options[r.correctIndex]?.text ?? '—'}」</>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <button onClick={() => void removeProfile()} className="mx-auto block text-xs text-red-300/70 underline-offset-2 hover:underline">
        删除整个问答档案
      </button>
    </div>
  )
}
