import { nanoid } from 'nanoid'

export interface Identity {
  id: string
  nickname: string
  avatar: string
}

const KEY = 'cloudztree.identity.v1'

const DEFAULT_NAMES = ['雪夜旅人', '爬树小能手', '圣诞侦察兵', '星星收集者', '冬日访客']

export function getIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Identity
      if (parsed && parsed.id) return parsed
    }
  } catch {
    /* ignore */
  }
  const fresh: Identity = {
    id: nanoid(16),
    nickname: DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)],
    avatar: '🦊',
  }
  localStorage.setItem(KEY, JSON.stringify(fresh))
  return fresh
}

export function saveIdentity(next: Identity): void {
  localStorage.setItem(KEY, JSON.stringify(next))
}

/** 云端模式下把本地身份 id 换成 Supabase 匿名登录的 uid（昵称头像保留）。 */
export function adoptCloudId(uid: string): Identity {
  const cur = getIdentity()
  if (cur.id === uid) return cur
  const next = { ...cur, id: uid }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
