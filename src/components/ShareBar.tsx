import { useState } from 'react'

/** 复制链接 + 系统分享，带明确成功/失败反馈。 */
export default function ShareBar({ url, title }: { url: string; title: string }) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const flash = (msg: string) => {
    setFeedback(msg)
    window.setTimeout(() => setFeedback(null), 2200)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      flash('链接已复制，去粘贴给好友吧')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        flash('链接已复制，去粘贴给好友吧')
      } catch {
        flash('复制失败，长按链接手动复制')
      }
      ta.remove()
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title} —— 来爬我的圣诞树，看你能爬多高！`, url })
        flash('已打开系统分享')
      } catch {
        /* 用户取消分享，不提示 */
      }
    } else {
      void copy()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2.5 text-xs text-frost-300">{url}</div>
        <button onClick={copy} className="btn-ghost shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium">
          复制链接
        </button>
        <button onClick={share} className="btn-gold shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-bold">
          分享
        </button>
      </div>
      {feedback && <p className="text-center text-xs text-gold-300">{feedback}</p>}
    </div>
  )
}

export function treeInviteUrl(id: string): string {
  return `${window.location.origin}/tree/visit?id=${encodeURIComponent(id)}`
}

export function quizInviteUrl(id: string): string {
  return `${window.location.origin}/quiz/take?id=${encodeURIComponent(id)}`
}
