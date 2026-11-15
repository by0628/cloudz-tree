import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Db } from './db'
import type { GameRecord, NewRecord, Tree, TreeMessage, TreeTheme, Visit } from './types'

/**
 * Supabase 适配器：配置了 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时启用。
 * 身份使用 Supabase 匿名登录（Auth → signInAnonymously，需在控制台开启），
 * RLS 策略按 auth.uid() 校验归属，见 supabase/schema.sql。
 * 前端只使用 anon key，绝不放 service role key。
 */

interface TreeRow {
  id: string
  owner_id: string
  owner_nickname: string
  owner_avatar: string
  name: string
  theme: TreeTheme
  created_at: string
}
interface RecordRow {
  id: string
  tree_id: string
  player_id: string
  player_nickname: string
  score: number
  height_m: number
  stars: number
  created_at: string
}
interface MessageRow {
  id: string
  tree_id: string
  author_id: string
  author_nickname: string
  content: string
  reports: number
  created_at: string
}
interface VisitRow {
  id: string
  tree_id: string
  visitor_id: string
  visitor_nickname: string
  created_at: string
}

const ms = (iso: string) => new Date(iso).getTime()
const mapTree = (r: TreeRow): Tree => ({
  id: r.id, ownerId: r.owner_id, ownerNickname: r.owner_nickname, ownerAvatar: r.owner_avatar,
  name: r.name, theme: r.theme, createdAt: ms(r.created_at),
})
const mapRecord = (r: RecordRow): GameRecord => ({
  id: r.id, treeId: r.tree_id, playerId: r.player_id, playerNickname: r.player_nickname,
  score: r.score, heightM: Number(r.height_m), stars: r.stars, createdAt: ms(r.created_at),
})
const mapMessage = (r: MessageRow): TreeMessage => ({
  id: r.id, treeId: r.tree_id, authorId: r.author_id, authorNickname: r.author_nickname,
  content: r.content, reports: r.reports, createdAt: ms(r.created_at),
})
const mapVisit = (r: VisitRow): Visit => ({
  id: r.id, treeId: r.tree_id, visitorId: r.visitor_id, visitorNickname: r.visitor_nickname,
  createdAt: ms(r.created_at),
})

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export class SupabaseDb implements Db {
  readonly mode = 'cloud' as const
  private client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey)
  }

  async initCloudIdentity(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    if (data.session?.user) return data.session.user.id
    const { data: anon, error } = await this.client.auth.signInAnonymously()
    if (error) throw new Error(`匿名登录失败：${error.message}（请在 Supabase 控制台开启 Anonymous sign-ins）`)
    return anon.user?.id ?? null
  }

  private async upsertProfile(id: string, nickname: string, avatar: string): Promise<void> {
    await this.client.from('profiles').upsert({ id, nickname, avatar }, { onConflict: 'id' })
  }

  async getTree(id: string): Promise<Tree | null> {
    const res = await this.client.from('trees').select('*').eq('id', id).maybeSingle()
    const row = must<TreeRow | null>(res)
    return row ? mapTree(row) : null
  }

  async recentTrees(limit: number): Promise<Tree[]> {
    const rows = must<TreeRow[]>(await this.client.from('trees').select('*').order('created_at', { ascending: false }).limit(limit))
    return rows.map(mapTree)
  }

  async listTreesByOwner(ownerId: string): Promise<Tree[]> {
    const rows = must<TreeRow[]>(await this.client.from('trees').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }))
    return rows.map(mapTree)
  }

  async createTree(input: Omit<Tree, 'createdAt'>): Promise<Tree> {
    await this.upsertProfile(input.ownerId, input.ownerNickname, input.ownerAvatar)
    const row = must<TreeRow>(
      await this.client.from('trees').insert({
        id: input.id, owner_id: input.ownerId, owner_nickname: input.ownerNickname,
        owner_avatar: input.ownerAvatar, name: input.name, theme: input.theme,
      }).select('*').single(),
    )
    return mapTree(row)
  }

  async deleteTree(id: string, ownerId: string): Promise<void> {
    must<null>(await this.client.from('trees').delete().eq('id', id).eq('owner_id', ownerId))
  }

  async recordVisit(input: Omit<Visit, 'id' | 'createdAt'>): Promise<void> {
    must<null>(
      await this.client.from('visits').insert({
        tree_id: input.treeId, visitor_id: input.visitorId, visitor_nickname: input.visitorNickname,
      }),
    )
  }

  async listVisits(treeId: string, limit: number): Promise<Visit[]> {
    const rows = must<VisitRow[]>(
      await this.client.from('visits').select('*').eq('tree_id', treeId).order('created_at', { ascending: false }).limit(limit),
    )
    return rows.map(mapVisit)
  }

  async visitsForOwner(ownerId: string, limit: number): Promise<(Visit & { treeName: string })[]> {
    const trees = await this.listTreesByOwner(ownerId)
    if (!trees.length) return []
    const names = new Map(trees.map((t) => [t.id, t.name]))
    const rows = must<VisitRow[]>(
      await this.client.from('visits').select('*').in('tree_id', [...names.keys()]).order('created_at', { ascending: false }).limit(limit),
    )
    return rows.map((r) => ({ ...mapVisit(r), treeName: names.get(r.tree_id) ?? '' }))
  }

  async addRecord(treeId: string, playerId: string, playerNickname: string, r: NewRecord): Promise<GameRecord> {
    const row = must<RecordRow>(
      await this.client.from('game_records').insert({
        tree_id: treeId, player_id: playerId, player_nickname: playerNickname,
        score: r.score, height_m: r.heightM, stars: r.stars,
      }).select('*').single(),
    )
    return mapRecord(row)
  }

  async listRecords(treeId: string, limit: number): Promise<GameRecord[]> {
    const rows = must<RecordRow[]>(
      await this.client.from('game_records').select('*').eq('tree_id', treeId).order('score', { ascending: false }).limit(limit),
    )
    return rows.map(mapRecord)
  }

  async topRecords(treeId: string | null, limit: number): Promise<GameRecord[]> {
    let q = this.client.from('game_records').select('*').order('score', { ascending: false }).limit(limit)
    if (treeId) q = q.eq('tree_id', treeId)
    const rows = must<RecordRow[]>(await q)
    return rows.map(mapRecord)
  }

  async myRecords(playerId: string, limit: number): Promise<GameRecord[]> {
    const rows = must<RecordRow[]>(
      await this.client.from('game_records').select('*').eq('player_id', playerId).order('created_at', { ascending: false }).limit(limit),
    )
    return rows.map(mapRecord)
  }

  async listMessages(treeId: string, limit: number): Promise<TreeMessage[]> {
    const rows = must<MessageRow[]>(
      await this.client.from('messages').select('*').eq('tree_id', treeId).lt('reports', 3).order('created_at', { ascending: false }).limit(limit),
    )
    return rows.map(mapMessage)
  }

  async messagesForOwner(ownerId: string, limit: number): Promise<(TreeMessage & { treeName: string })[]> {
    const trees = await this.listTreesByOwner(ownerId)
    if (!trees.length) return []
    const names = new Map(trees.map((t) => [t.id, t.name]))
    const rows = must<MessageRow[]>(
      await this.client.from('messages').select('*').in('tree_id', [...names.keys()]).lt('reports', 3).order('created_at', { ascending: false }).limit(limit),
    )
    return rows.map((r) => ({ ...mapMessage(r), treeName: names.get(r.tree_id) ?? '' }))
  }

  async addMessage(input: Omit<TreeMessage, 'id' | 'reports' | 'createdAt'>): Promise<TreeMessage> {
    await this.upsertProfile(input.authorId, input.authorNickname, '🙂')
    const row = must<MessageRow>(
      await this.client.from('messages').insert({
        tree_id: input.treeId, author_id: input.authorId, author_nickname: input.authorNickname, content: input.content,
      }).select('*').single(),
    )
    return mapMessage(row)
  }

  async deleteMessage(id: string, authorId: string): Promise<void> {
    must<null>(await this.client.from('messages').delete().eq('id', id).eq('author_id', authorId))
  }

  async reportMessage(id: string): Promise<void> {
    const { data, error } = await this.client.rpc('report_message', { target: id })
    if (error) {
      // 回退：直接 +1（RLS 需允许 update reports，见 schema.sql 的 report_message 函数为首选）
      const rows = must<MessageRow[]>(await this.client.from('messages').select('*').eq('id', id).limit(1))
      const cur = rows[0]
      if (cur) must<null>(await this.client.from('messages').update({ reports: cur.reports + 1 }).eq('id', id))
      return
    }
    void data
  }

  async stats(treeId: string) {
    const [v, r, best] = await Promise.all([
      this.client.from('visits').select('id', { count: 'exact', head: true }).eq('tree_id', treeId),
      this.client.from('game_records').select('id', { count: 'exact', head: true }).eq('tree_id', treeId),
      this.client.from('game_records').select('score').eq('tree_id', treeId).order('score', { ascending: false }).limit(1),
    ])
    if (v.error) throw new Error(v.error.message)
    if (r.error) throw new Error(r.error.message)
    const bestRows = must<{ score: number }[]>(best)
    return { visits: v.count ?? 0, plays: r.count ?? 0, bestScore: bestRows[0]?.score ?? 0 }
  }
}
