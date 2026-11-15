import type {
  GameRecord, NewRecord, QuizAttempt, QuizAttemptResult, QuizProfile, QuizQuestion, QuizQuestionWithAnswer,
  Tree, TreeMessage, TreeStats, Visit,
} from './types'
import { LocalDb } from './dbLocal'
import { SupabaseDb } from './dbSupabase'

export interface Db {
  readonly mode: 'cloud' | 'demo'
  /** 云端模式：确保匿名登录并返回 uid；演示模式返回 null。 */
  initCloudIdentity(): Promise<string | null>

  getTree(id: string): Promise<Tree | null>
  recentTrees(limit: number): Promise<Tree[]>
  listTreesByOwner(ownerId: string): Promise<Tree[]>
  createTree(input: Omit<Tree, 'createdAt'>): Promise<Tree>
  deleteTree(id: string, ownerId: string): Promise<void>

  recordVisit(input: Omit<Visit, 'id' | 'createdAt'>): Promise<void>
  listVisits(treeId: string, limit: number): Promise<Visit[]>
  visitsForOwner(ownerId: string, limit: number): Promise<(Visit & { treeName: string })[]>

  addRecord(treeId: string, playerId: string, playerNickname: string, r: NewRecord): Promise<GameRecord>
  listRecords(treeId: string, limit: number): Promise<GameRecord[]>
  topRecords(treeId: string | null, limit: number): Promise<GameRecord[]>
  myRecords(playerId: string, limit: number): Promise<GameRecord[]>

  listMessages(treeId: string, limit: number): Promise<TreeMessage[]>
  messagesForOwner(ownerId: string, limit: number): Promise<(TreeMessage & { treeName: string })[]>
  addMessage(input: Omit<TreeMessage, 'id' | 'reports' | 'createdAt'>): Promise<TreeMessage>
  deleteMessage(id: string, authorId: string): Promise<void>
  reportMessage(id: string): Promise<void>

  stats(treeId: string): Promise<TreeStats>

  // ---------- 个人问答 ----------
  getQuizProfile(id: string): Promise<QuizProfile | null>
  getQuizProfileByOwner(ownerId: string): Promise<QuizProfile | null>
  /** 新建（带 id）或更新（标题/介绍）自己的问答档案 */
  saveQuizProfile(input: Omit<QuizProfile, 'createdAt' | 'updatedAt'>): Promise<QuizProfile>
  deleteQuizProfile(id: string, ownerId: string): Promise<void>
  /** 公开题目（不含正确答案） */
  listQuizQuestions(profileId: string): Promise<QuizQuestion[]>
  /** 出题人自己的题目（含正确答案） */
  listMyQuizQuestions(profileId: string): Promise<QuizQuestionWithAnswer[]>
  /** 整体替换某档案的题目与答案（仅出题人） */
  saveQuizQuestions(profileId: string, questions: Omit<QuizQuestionWithAnswer, 'id' | 'profileId' | 'sort'>[]): Promise<void>
  /** 提交答题：云端走服务端 RPC 计分，身份由服务端校验 */
  submitQuizAttempt(profileId: string, takerId: string, takerNickname: string, answers: number[]): Promise<QuizAttemptResult>
  /** 某档案的答题记录（云端 RLS：仅出题人与答题人本人可见） */
  listQuizAttempts(profileId: string, limit: number): Promise<QuizAttempt[]>
  /** 我答过的记录 */
  myQuizAttempts(takerId: string, limit: number): Promise<QuizAttempt[]>
  /** 逐题对错详情（仅答题人本人或出题人） */
  getQuizReview(attemptId: string): Promise<QuizAttemptResult>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const db: Db = url && anon ? new SupabaseDb(url, anon) : new LocalDb()
