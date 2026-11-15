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

export const THEMES: Record<TreeTheme, { label: string; desc: string }> = {
  classic: { label: '经典暖冬', desc: '松针绿 × 暖金彩灯，最圣诞的味道' },
  ice: { label: '冰雪秘境', desc: '冰蓝银白，像雪夜里的水晶树' },
  candy: { label: '糖果派对', desc: '红白粉彩，甜甜的节日气氛' },
}

export const AVATARS = ['🦊', '🐰', '🐼', '🦌', '🐧', '🦉', '🐱', '🐶', '🎅', '⛄', '🦄', '🐻']
