import { nanoid } from 'nanoid'
import type { Db } from './db'
import type {
  GameRecord, NewRecord, QuizAttempt, QuizAttemptResult, QuizProfile, QuizQuestion, QuizQuestionWithAnswer,
  Tree, TreeMessage, Visit,
} from './types'

/**
 * 本地演示适配器：未配置 Supabase 环境变量时启用。
 * 数据只存在当前浏览器的 localStorage —— 仅供本地演示与联调，
 * 不是多人共享数据库；邀请链接在本设备上可完整体验流程。
 */

const KEY = 'cloudztree.demo-db.v1'
export const DEMO_TREE_ID = 'demo-tree'

interface Store {
  trees: Tree[]
  records: GameRecord[]
  messages: TreeMessage[]
  visits: Visit[]
  quizProfiles: QuizProfile[]
  quizQuestions: QuizQuestionWithAnswer[]
  quizAttempts: (QuizAttempt & { answers: number[] })[]
}

export const DEMO_QUIZ_ID = 'demo-quiz'

function seedQuiz(): Pick<Store, 'quizProfiles' | 'quizQuestions' | 'quizAttempts'> {
  const now = Date.now()
  const mk = (
    sort: number,
    text: string,
    options: string[],
    correctIndex: number,
  ): QuizQuestionWithAnswer => ({
    id: nanoid(12),
    profileId: DEMO_QUIZ_ID,
    sort,
    text,
    options: options.map((t) => ({ text: t })),
    correctIndex,
  })
  return {
    quizProfiles: [
      {
        id: DEMO_QUIZ_ID,
        ownerId: 'demo-gardener',
        ownerNickname: '冬日园丁',
        ownerAvatar: '🎅',
        title: '你有多了解冬日园丁？',
        intro: '答对越多，说明我们越有默契。答完别忘了去爬我的圣诞树！',
        createdAt: now - 86400_000 * 2,
        updatedAt: now - 86400_000 * 2,
      },
    ],
    quizQuestions: [
      mk(0, '冬日园丁最喜欢的季节是？', ['冬天', '春天', '夏天', '秋天'], 0),
      mk(1, 'TA 在冬天最爱喝什么？', ['热可可', '冰美式', '柠檬水', '珍珠奶茶'], 0),
      mk(2, 'TA 的圣诞树是什么主题？', ['经典暖冬', '冰雪秘境', '糖果派对'], 0),
      mk(3, 'TA 在自己树上的最高纪录大约是？', ['1000 分', '2000 分', '2840 分', '5000 分'], 2),
      mk(4, 'TA 最想收到的圣诞礼物是？', ['一本好书', '温暖的围巾', '游戏机', '一盆绿植'], 1),
    ],
    quizAttempts: [
      {
        id: nanoid(12), profileId: DEMO_QUIZ_ID, takerId: 'p2', takerNickname: '雪地狐狸',
        score: 4, total: 5, answers: [0, 0, 0, 2, 0], createdAt: now - 3600_000 * 6,
      },
    ],
  }
}

function seed(): Store {
  const now = Date.now()
  const demoTree: Tree = {
    id: DEMO_TREE_ID,
    ownerId: 'demo-gardener',
    ownerNickname: '冬日园丁',
    ownerAvatar: '🎅',
    name: '全村最高的圣诞树',
    theme: 'classic',
    createdAt: now - 86400_000 * 3,
  }
  return {
    trees: [demoTree],
    records: [
      { id: nanoid(12), treeId: DEMO_TREE_ID, playerId: 'p1', playerNickname: '爬树冠军', score: 2840, heightM: 52.4, stars: 12, createdAt: now - 3600_000 * 5 },
      { id: nanoid(12), treeId: DEMO_TREE_ID, playerId: 'p2', playerNickname: '雪地狐狸', score: 2130, heightM: 41.8, stars: 8, createdAt: now - 3600_000 * 9 },
      { id: nanoid(12), treeId: DEMO_TREE_ID, playerId: 'p3', playerNickname: '夜猫子', score: 1560, heightM: 33.2, stars: 5, createdAt: now - 3600_000 * 26 },
    ],
    messages: [
      { id: nanoid(12), treeId: DEMO_TREE_ID, authorId: 'p2', authorNickname: '雪地狐狸', content: '这棵树也太高了，爬到一半手都酸了😂', reports: 0, createdAt: now - 3600_000 * 8 },
      { id: nanoid(12), treeId: DEMO_TREE_ID, authorId: 'p1', authorNickname: '爬树冠军', content: '小技巧：贴着树干爬，雪球不容易砸中！', reports: 0, createdAt: now - 3600_000 * 4 },
    ],
    visits: [
      { id: nanoid(12), treeId: DEMO_TREE_ID, visitorId: 'p1', visitorNickname: '爬树冠军', createdAt: now - 3600_000 * 5 },
      { id: nanoid(12), treeId: DEMO_TREE_ID, visitorId: 'p2', visitorNickname: '雪地狐狸', createdAt: now - 3600_000 * 9 },
    ],
    ...seedQuiz(),
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Store
      // 旧版本地数据没有问答字段时补上种子问答（不丢已有数据）
      if (!Array.isArray(s.quizProfiles)) Object.assign(s, seedQuiz())
      return s
    }
  } catch {
    /* fall through to seed */
  }
  const s = seed()
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

function save(s: Store): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

const byTimeDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt
const visible = (m: TreeMessage) => m.reports < 3

export class LocalDb implements Db {
  readonly mode = 'demo' as const

  async initCloudIdentity(): Promise<string | null> {
    return null
  }

  async getTree(id: string): Promise<Tree | null> {
    return load().trees.find((t) => t.id === id) ?? null
  }

  async recentTrees(limit: number): Promise<Tree[]> {
    return [...load().trees].sort(byTimeDesc).slice(0, limit)
  }

  async listTreesByOwner(ownerId: string): Promise<Tree[]> {
    return load().trees.filter((t) => t.ownerId === ownerId).sort(byTimeDesc)
  }

  async createTree(input: Omit<Tree, 'createdAt'>): Promise<Tree> {
    const s = load()
    const tree: Tree = { ...input, createdAt: Date.now() }
    s.trees.push(tree)
    save(s)
    return tree
  }

  async deleteTree(id: string, ownerId: string): Promise<void> {
    const s = load()
    s.trees = s.trees.filter((t) => !(t.id === id && t.ownerId === ownerId))
    s.records = s.records.filter((r) => r.treeId !== id)
    s.messages = s.messages.filter((m) => m.treeId !== id)
    s.visits = s.visits.filter((v) => v.treeId !== id)
    save(s)
  }

  async recordVisit(input: Omit<Visit, 'id' | 'createdAt'>): Promise<void> {
    const s = load()
    s.visits.push({ ...input, id: nanoid(12), createdAt: Date.now() })
    save(s)
  }

  async listVisits(treeId: string, limit: number): Promise<Visit[]> {
    return load().visits.filter((v) => v.treeId === treeId).sort(byTimeDesc).slice(0, limit)
  }

  async visitsForOwner(ownerId: string, limit: number): Promise<(Visit & { treeName: string })[]> {
    const s = load()
    const mine = new Map(s.trees.filter((t) => t.ownerId === ownerId).map((t) => [t.id, t.name]))
    return s.visits
      .filter((v) => mine.has(v.treeId))
      .sort(byTimeDesc)
      .slice(0, limit)
      .map((v) => ({ ...v, treeName: mine.get(v.treeId) ?? '' }))
  }

  async addRecord(treeId: string, playerId: string, playerNickname: string, r: NewRecord): Promise<GameRecord> {
    const s = load()
    const rec: GameRecord = { id: nanoid(12), treeId, playerId, playerNickname, ...r, createdAt: Date.now() }
    s.records.push(rec)
    save(s)
    return rec
  }

  async listRecords(treeId: string, limit: number): Promise<GameRecord[]> {
    return load().records.filter((r) => r.treeId === treeId).sort((a, b) => b.score - a.score).slice(0, limit)
  }

  async topRecords(treeId: string | null, limit: number): Promise<GameRecord[]> {
    const all = load().records
    const pool = treeId ? all.filter((r) => r.treeId === treeId) : all
    return [...pool].sort((a, b) => b.score - a.score).slice(0, limit)
  }

  async myRecords(playerId: string, limit: number): Promise<GameRecord[]> {
    return load().records.filter((r) => r.playerId === playerId).sort(byTimeDesc).slice(0, limit)
  }

  async listMessages(treeId: string, limit: number): Promise<TreeMessage[]> {
    return load().messages.filter((m) => m.treeId === treeId && visible(m)).sort(byTimeDesc).slice(0, limit)
  }

  async messagesForOwner(ownerId: string, limit: number): Promise<(TreeMessage & { treeName: string })[]> {
    const s = load()
    const mine = new Map(s.trees.filter((t) => t.ownerId === ownerId).map((t) => [t.id, t.name]))
    return s.messages
      .filter((m) => mine.has(m.treeId) && visible(m))
      .sort(byTimeDesc)
      .slice(0, limit)
      .map((m) => ({ ...m, treeName: mine.get(m.treeId) ?? '' }))
  }

  async addMessage(input: Omit<TreeMessage, 'id' | 'reports' | 'createdAt'>): Promise<TreeMessage> {
    const s = load()
    const msg: TreeMessage = { ...input, id: nanoid(12), reports: 0, createdAt: Date.now() }
    s.messages.push(msg)
    save(s)
    return msg
  }

  async deleteMessage(id: string, authorId: string): Promise<void> {
    const s = load()
    s.messages = s.messages.filter((m) => !(m.id === id && m.authorId === authorId))
    save(s)
  }

  async reportMessage(id: string): Promise<void> {
    const s = load()
    const m = s.messages.find((x) => x.id === id)
    if (m) m.reports += 1
    save(s)
  }

  async stats(treeId: string) {
    const s = load()
    const recs = s.records.filter((r) => r.treeId === treeId)
    return {
      visits: s.visits.filter((v) => v.treeId === treeId).length,
      plays: recs.length,
      bestScore: recs.reduce((max, r) => Math.max(max, r.score), 0),
    }
  }

  // ---------- 个人问答（演示模式：单设备本地语义，隔离由云端 RLS 保证） ----------

  async getQuizProfile(id: string): Promise<QuizProfile | null> {
    return load().quizProfiles.find((p) => p.id === id) ?? null
  }

  async getQuizProfileByOwner(ownerId: string): Promise<QuizProfile | null> {
    return load().quizProfiles.find((p) => p.ownerId === ownerId) ?? null
  }

  async saveQuizProfile(input: Omit<QuizProfile, 'createdAt' | 'updatedAt'>): Promise<QuizProfile> {
    const s = load()
    const now = Date.now()
    const existing = s.quizProfiles.find((p) => p.id === input.id)
    const profile: QuizProfile = { ...input, createdAt: existing?.createdAt ?? now, updatedAt: now }
    if (existing) s.quizProfiles = s.quizProfiles.map((p) => (p.id === input.id ? profile : p))
    else s.quizProfiles.push(profile)
    save(s)
    return profile
  }

  async deleteQuizProfile(id: string, ownerId: string): Promise<void> {
    const s = load()
    s.quizProfiles = s.quizProfiles.filter((p) => !(p.id === id && p.ownerId === ownerId))
    s.quizQuestions = s.quizQuestions.filter((q) => q.profileId !== id)
    s.quizAttempts = s.quizAttempts.filter((a) => a.profileId !== id)
    save(s)
  }

  async listQuizQuestions(profileId: string): Promise<QuizQuestion[]> {
    return load().quizQuestions
      .filter((q) => q.profileId === profileId)
      .sort((a, b) => a.sort - b.sort)
      .map(({ correctIndex: _ignored, ...rest }) => rest)
  }

  async listMyQuizQuestions(profileId: string): Promise<QuizQuestionWithAnswer[]> {
    return load().quizQuestions.filter((q) => q.profileId === profileId).sort((a, b) => a.sort - b.sort)
  }

  async saveQuizQuestions(
    profileId: string,
    questions: Omit<QuizQuestionWithAnswer, 'id' | 'profileId' | 'sort'>[],
  ): Promise<void> {
    const s = load()
    s.quizQuestions = s.quizQuestions.filter((q) => q.profileId !== profileId)
    questions.forEach((q, i) => {
      s.quizQuestions.push({ ...q, id: nanoid(12), profileId, sort: i })
    })
    save(s)
  }

  async submitQuizAttempt(
    profileId: string,
    takerId: string,
    takerNickname: string,
    answers: number[],
  ): Promise<QuizAttemptResult> {
    const s = load()
    const questions = s.quizQuestions.filter((q) => q.profileId === profileId).sort((a, b) => a.sort - b.sort)
    if (!questions.length) throw new Error('quiz has no questions')
    if (answers.length !== questions.length) throw new Error('answers length mismatch')
    let score = 0
    const review = questions.map((q, i) => {
      if (answers[i] === q.correctIndex) score += 1
      return {
        questionId: q.id, text: q.text, imageUrl: q.imageUrl, options: q.options,
        chosen: answers[i], correctIndex: q.correctIndex,
      }
    })
    const attempt: QuizAttempt = {
      id: nanoid(12), profileId, takerId, takerNickname, score, total: questions.length, createdAt: Date.now(),
    }
    s.quizAttempts.push({ ...attempt, answers })
    save(s)
    return { attempt, review }
  }

  async listQuizAttempts(profileId: string, limit: number): Promise<QuizAttempt[]> {
    return load().quizAttempts
      .filter((a) => a.profileId === profileId)
      .sort(byTimeDesc)
      .slice(0, limit)
      .map(({ answers: _ignored, ...rest }) => rest)
  }

  async myQuizAttempts(takerId: string, limit: number): Promise<QuizAttempt[]> {
    return load().quizAttempts
      .filter((a) => a.takerId === takerId)
      .sort(byTimeDesc)
      .slice(0, limit)
      .map(({ answers: _ignored, ...rest }) => rest)
  }

  async getQuizReview(attemptId: string): Promise<QuizAttemptResult> {
    const s = load()
    const found = s.quizAttempts.find((a) => a.id === attemptId)
    if (!found) throw new Error('attempt not found')
    const questions = s.quizQuestions.filter((q) => q.profileId === found.profileId).sort((a, b) => a.sort - b.sort)
    const { answers, ...attempt } = found
    return {
      attempt,
      review: questions.map((q, i) => ({
        questionId: q.id, text: q.text, imageUrl: q.imageUrl, options: q.options,
        chosen: answers[i] ?? -1, correctIndex: q.correctIndex,
      })),
    }
  }
}
