export type TreeTheme = 'classic' | 'ice' | 'candy'

export interface Profile {
  id: string
  nickname: string
  avatar: string
  createdAt: number
}

export interface Tree {
  id: string
  ownerId: string
  ownerNickname: string
  ownerAvatar: string
  name: string
  theme: TreeTheme
  createdAt: number
}

export interface GameRecord {
  id: string
  treeId: string
  playerId: string
  playerNickname: string
  score: number
  heightM: number
  stars: number
  createdAt: number
}

export interface TreeMessage {
  id: string
  treeId: string
  authorId: string
  authorNickname: string
  content: string
  reports: number
  createdAt: number
}

export interface Visit {
  id: string
  treeId: string
  visitorId: string
  visitorNickname: string
  createdAt: number
}

export interface TreeStats {
  visits: number
  plays: number
  bestScore: number
}

export interface NewRecord {
  score: number
  heightM: number
  stars: number
}

// ---------- 个人问答（你有多了解我） ----------

export interface QuizOption {
  text: string
  imageUrl?: string
}

export interface QuizProfile {
  id: string
  ownerId: string
  ownerNickname: string
  ownerAvatar: string
  title: string
  intro: string
  createdAt: number
  updatedAt: number
}

/** 对外公开的题目形状：不含正确答案 */
export interface QuizQuestion {
  id: string
  profileId: string
  sort: number
  text: string
  imageUrl?: string
  options: QuizOption[]
}

/** 仅出题人可见：带正确答案下标 */
export interface QuizQuestionWithAnswer extends QuizQuestion {
  correctIndex: number
}

export interface QuizAttempt {
  id: string
  profileId: string
  takerId: string
  takerNickname: string
  score: number
  total: number
  createdAt: number
}

export interface QuizReviewItem {
  questionId: string
  text: string
  imageUrl?: string
  options: QuizOption[]
  chosen: number
  correctIndex: number
}

export interface QuizAttemptResult {
  attempt: QuizAttempt
  review: QuizReviewItem[]
}

/** 了解程度分档（按正确率） */
export function quizTier(pct: number): { title: string; line: string } {
  if (pct >= 0.9) return { title: '灵魂知己', line: '这也太懂了吧！TA 的小习惯你全都记在心里，你们是命中注定的好朋友！' }
  if (pct >= 0.7) return { title: '超级懂 TA', line: '答对了这么多，平时没少认真听 TA 说话吧，这份了解很珍贵。' }
  if (pct >= 0.4) return { title: '渐入佳境', line: '已经摸到门道啦，再多聊聊天、多一起玩几次，你会更懂 TA 的。' }
  return { title: '新朋友报到', line: '刚认识也没关系！这次答题就是最好的开始，去树下给 TA 留句话吧。' }
}

export const THEMES: Record<TreeTheme, { label: string; desc: string }> = {
  classic: { label: '经典暖冬', desc: '松针绿 × 暖金彩灯，最圣诞的味道' },
  ice: { label: '冰雪秘境', desc: '冰蓝银白，像雪夜里的水晶树' },
  candy: { label: '糖果派对', desc: '红白粉彩，甜甜的节日气氛' },
}

export const AVATARS = ['🦊', '🐰', '🐼', '🦌', '🐧', '🦉', '🐱', '🐶', '🎅', '⛄', '🦄', '🐻']
