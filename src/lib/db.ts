import type { GameRecord, NewRecord, Tree, TreeMessage, TreeStats, Visit } from './types'
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
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const db: Db = url && anon ? new SupabaseDb(url, anon) : new LocalDb()
