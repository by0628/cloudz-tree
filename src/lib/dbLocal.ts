import { nanoid } from 'nanoid'
import type { Db } from './db'
import type { GameRecord, NewRecord, Tree, TreeMessage, Visit } from './types'

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
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Store
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
}
