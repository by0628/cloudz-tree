import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AvatarView } from './CreateTree'
import { db } from '../lib/db'
import { getIdentity } from '../lib/identity'
import { quizTier, type QuizAttemptResult, type QuizProfile, type QuizQuestion, type Tree } from '../lib/types'

type Phase = 'loading' | 'missing' | 'error' | 'own' | 'intro' | 'asking' | 'submitting' | 'done'

const BEAR_LINES = [
  '这题你肯定知道！',
  '想想 TA 平时的样子…',
  '凭第一感觉选，往往最准！',
  'TA 好像提起过这个哦。',
  '回忆一下你们聊天的时候…',
  '别紧张，阿棕陪着你。',
  '这题是送分题，我说的！',
]

function BearBubble({ text }: { text: string }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-2xl ring-1 ring-gold-400/40">🐻</div>
      <div className="relative rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-sm leading-relaxed">
        {text}
        <span className="absolute -left-1 bottom-2 h-2.5 w-2.5 rotate-45 bg-white/10" />
      </div>
    </div>
  )
}

export default function QuizTake() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? ''
  const [phase, setPhase] = useState<Phase>('loading')
  const [profile, setProfile] = useState<QuizProfile | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [ownerTree, setOwnerTree] = useState<Tree | null>(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<QuizAttemptResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const advancingRef = useRef(false)

  useEffect(() => {
    if (!id) {
      setPhase('missing')
      return
    }
    void (async () => {
      try {
        const p = await db.getQuizProfile(id)
        if (!p) {
          setPhase('missing')
          return
        }
        const qs = await db.listQuizQuestions(id)
        if (!qs.length) {
          setPhase('missing')
          return
        }
        setProfile(p)
        setQuestions(qs)
        const trees = await db.listTreesByOwner(p.ownerId).catch(() => [])
        setOwnerTree(trees[0] ?? null)
        // 出题人本人：给一点时间等云端身份切换完成再判断
        window.setTimeout(() => {
          setPhase(getIdentity().id === p.ownerId ? 'own' : 'intro')
        }, 600)
      } catch {
        setPhase('error')
      }
    })()
  }, [id])

  const bearLine = useMemo(() => BEAR_LINES[current % BEAR_LINES.length], [current])
  const q = questions[current]

  const choose = (oi: number) => {
    if (advancingRef.current || phase !== 'asking') return
    advancingRef.current = true
    setPicked(oi)
    const next = [...answers]
    next[current] = oi
    setAnswers(next)
    window.setTimeout(() => {
      advancingRef.current = false
      setPicked(null)
      if (current + 1 < questions.length) {
        setCurrent(current + 1)
      } else {
        void submit(next)
      }
    }, 380)
  }

  const submit = async (finalAnswers: number[]) => {
    if (!profile) return
    const me = getIdentity()
    if (me.id === profile.ownerId) {
      setPhase('own')
      return
    }
    setPhase('submitting')
    setSubmitError(null)
    try {
      const r = await db.submitQuizAttempt(profile.id, me.id, me.nickname, finalAnswers)
      setResult(r)
      setPhase('done')
    } catch {
      setSubmitError('提交失败，检查网络后再点一次提交')
      setPhase('asking')
      setCurrent(questions.length - 1)
    }
  }

  const restart = () => {
    setAnswers([])
    setCurrent(0)
    setResult(null)
    setPhase('intro')
  }

  if (phase === 'loading') {
    return <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center text-frost-300">阿棕正在搬题目… 🐻</div>
  }
  if (phase === 'missing') {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl">🌌</div>
        <h1 className="mt-3 text-xl font-bold">这份问答不见了</h1>
        <p className="mt-2 text-sm leading-relaxed text-frost-300">链接可能输错了，或者出题人已经把它删掉。你也可以出自己的问答邀朋友来答。</p>
        <Link to="/quiz" className="btn-gold mt-5 inline-block rounded-2xl px-6 py-3 font-bold">出我的问答</Link>
      </div>
    )
  }
  if (phase === 'error' || !profile) {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl">📡</div>
        <h1 className="mt-3 text-xl font-bold">网络开小差了</h1>
        <p className="mt-2 text-sm text-frost-300">加载问答失败，检查网络后刷新试试。</p>
        <button onClick={() => window.location.reload()} className="btn-gold mt-5 rounded-2xl px-6 py-3 font-bold">刷新重试</button>
      </div>
    )
  }

  if (phase === 'own') {
    return (
      <div className="glass mx-auto max-w-md rounded-3xl p-8 text-center">
        <div className="text-5xl">🙈</div>
        <h1 className="mt-3 text-xl font-bold">这是你自己的问答</h1>
        <p className="mt-2 text-sm leading-relaxed text-frost-300">自己答自己的题可不算数哦。把链接发给朋友，看他们能答对几道；你可以在小屋里查看他们的成绩。</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/quiz" className="btn-gold rounded-2xl px-6 py-3 font-bold">去我的问答小屋</Link>
          {ownerTree && (
            <Link to={`/tree/visit?id=${ownerTree.id}`} className="btn-ghost rounded-2xl px-6 py-3">爬我的树</Link>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <section className="glass rounded-3xl p-6 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <AvatarView avatar={profile.ownerAvatar} size={46} />
            <div className="text-left">
              <div className="font-bold leading-tight">{profile.ownerNickname}</div>
              <div className="text-xs text-frost-300">出题人</div>
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-black">{profile.title}</h1>
          {profile.intro && <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-frost-300">{profile.intro}</p>}
          <div className="mx-auto mt-4 max-w-sm text-left">
            <BearBubble text={`一共 ${questions.length} 道题，答完立刻出「了解程度报告」。准备好了吗？`} />
          </div>
          <button onClick={() => setPhase('asking')} className="btn-gold mt-5 w-full max-w-sm rounded-2xl py-3.5 text-lg font-bold">
            开始答题
          </button>
          {ownerTree && (
            <p className="mt-3 text-sm text-frost-300">
              答完还可以去爬 TA 的圣诞树「{ownerTree.name}」{' '}
              <Link to={`/tree/visit?id=${ownerTree.id}`} className="text-gold-300">去看看 ›</Link>
            </p>
          )}
        </section>
      </div>
    )
  }

  if (phase === 'done' && result) {
    const pct = result.attempt.total ? result.attempt.score / result.attempt.total : 0
    const tier = quizTier(pct)
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <motion.section
          className="glass rounded-3xl p-6 text-center"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-sm tracking-[0.3em] text-gold-300">了解程度报告</div>
          <div className="mt-3 text-6xl font-black text-gold-300">
            {result.attempt.score}
            <span className="text-2xl text-frost-300"> / {result.attempt.total}</span>
          </div>
          <div className="mt-1 text-sm text-frost-300">正确率 {Math.round(pct * 100)}%</div>
          <div className="mx-auto mt-3 inline-block rounded-full bg-gold-400/20 px-4 py-1.5 font-bold text-gold-300 ring-1 ring-gold-400/50">
            🏅 {tier.title}
          </div>
          <div className="mx-auto mt-4 max-w-sm text-left">
            <BearBubble text={tier.line} />
          </div>
          <div className="mt-5 flex flex-col justify-center gap-2.5 sm:flex-row">
            {ownerTree && (
              <Link to={`/tree/visit?id=${ownerTree.id}`} className="btn-gold rounded-2xl px-6 py-3 font-bold">
                🌲 去爬 {profile.ownerNickname} 的圣诞树
              </Link>
            )}
            <button onClick={restart} className="btn-ghost rounded-2xl px-6 py-3">🔁 再答一次</button>
          </div>
          <p className="mt-3 text-xs text-frost-300/70">{profile.ownerNickname} 能在 TA 的小屋里看到你这份成绩。</p>
        </motion.section>

        <section className="glass rounded-3xl p-4">
          <h2 className="mb-3 font-bold">📋 逐题回顾</h2>
          <div className="space-y-2.5">
            {result.review.map((r, i) => {
              const right = r.chosen === r.correctIndex
              return (
                <div key={r.questionId} className="rounded-2xl bg-white/5 px-3.5 py-3 text-sm">
                  <div className="font-medium">
                    {right ? '✅' : '❌'} {i + 1}. {r.text}
                  </div>
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="mt-2 max-h-44 w-full rounded-xl object-cover" loading="lazy" />}
                  <div className="mt-1.5 text-xs leading-relaxed text-frost-300">
                    你的选择：<span className={right ? 'text-emerald-300' : 'text-red-300'}>{r.options[r.chosen]?.text ?? '—'}</span>
                    {!right && (
                      <>
                        {' '}· 正确答案：<span className="text-emerald-300">{r.options[r.correctIndex]?.text ?? '—'}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  // asking / submitting
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/12">
          <div
            className="h-full rounded-full bg-gold-400 transition-[width] duration-300"
            style={{ width: `${((current + (phase === 'submitting' ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-frost-300">第 {current + 1} / {questions.length} 题</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={current}
          className="glass rounded-3xl p-5"
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -26 }}
          transition={{ duration: 0.18 }}
        >
          <BearBubble text={bearLine} />
          <h2 className="mt-4 text-lg font-bold leading-relaxed">{q?.text}</h2>
          {q?.imageUrl && <img src={q.imageUrl} alt="" className="mt-3 max-h-56 w-full rounded-2xl object-cover" loading="lazy" />}
          <div className="mt-4 grid gap-2.5">
            {q?.options.map((o, oi) => (
              <button
                key={oi}
                onClick={() => choose(oi)}
                disabled={phase === 'submitting'}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition active:scale-[0.99] ${
                  picked === oi ? 'bg-gold-400 text-black ring-2 ring-gold-300' : 'bg-white/7 hover:bg-white/12'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${picked === oi ? 'bg-black/20' : 'bg-white/12'}`}>
                  {String.fromCharCode(65 + oi)}
                </span>
                <span className="min-w-0 flex-1">
                  {o.text}
                  {o.imageUrl && <img src={o.imageUrl} alt="" className="mt-2 max-h-32 w-full rounded-xl object-cover" loading="lazy" />}
                </span>
              </button>
            ))}
          </div>
          {submitError && <p className="mt-3 text-center text-sm text-red-300">{submitError}</p>}
          {phase === 'submitting' && <p className="mt-3 text-center text-sm text-gold-300">阿棕正在帮你批改… 🐻</p>}
        </motion.section>
      </AnimatePresence>

      <p className="text-center text-xs text-frost-300/60">
        正在答 {profile.ownerNickname} 的问答 · 答案由 TA 本人设置，分数由服务器计算
      </p>
    </div>
  )
}
