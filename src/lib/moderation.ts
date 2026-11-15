/**
 * 基础内容审核：拦截常见辱骂、广告引流与链接。
 * 这是第一道防线；云端模式还应配合数据库侧的举报隐藏（reports >= 3 自动隐藏）。
 */

const BANNED_WORDS = [
  '操你', '草你', '妈的', '傻逼', '煞笔', 'sb', 'nmsl', 'cnm', 'fuck', 'shit', 'bitch',
  '加微信', '加qq', '加我微信', 'vx', 'v信', '代充', '刷单', '博彩', '赌博', '贷款',
  '免费领取', '点击链接', 'http://', 'https://', 'www.', '.com', '.cn', '色情', '约炮',
]

export interface ModerationResult {
  ok: boolean
  reason?: string
}

export function checkContent(raw: string): ModerationResult {
  const text = raw.trim()
  if (text.length < 1) return { ok: false, reason: '内容不能为空' }
  if (text.length > 200) return { ok: false, reason: '最多 200 字' }
  const lower = text.toLowerCase().replace(/\s+/g, '')
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) return { ok: false, reason: '包含不合适的内容，换个说法试试' }
  }
  if (/(\S)\1{7,}/.test(text)) return { ok: false, reason: '不要刷屏哦' }
  return { ok: true }
}

export function checkNickname(raw: string): ModerationResult {
  const text = raw.trim()
  if (text.length < 1) return { ok: false, reason: '昵称不能为空' }
  if (text.length > 16) return { ok: false, reason: '昵称最多 16 字' }
  const lower = text.toLowerCase()
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) return { ok: false, reason: '这个昵称不太合适' }
  }
  return { ok: true }
}
