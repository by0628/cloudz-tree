import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { nanoid } from 'nanoid'
import TreeCanvas from '../components/TreeCanvas'
import ShareBar, { treeInviteUrl } from '../components/ShareBar'
import { db } from '../lib/db'
import { getIdentity, saveIdentity } from '../lib/identity'
import { checkNickname } from '../lib/moderation'
import { AVATARS, THEMES, type Tree, type TreeTheme } from '../lib/types'

/** 把上传头像压成 128×128 data URL，避免把原图塞进数据库。 */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('无法处理图片'))
      const side = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 128, 128)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = url
  })
}

export function AvatarView({ avatar, size = 40 }: { avatar: string; size?: number }) {
  if (avatar.startsWith('data:')) {
    return <img src={avatar} alt="头像" className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-white/10"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {avatar}
    </span>
  )
}

export default function CreateTree() {
  const navigate = useNavigate()
  const me = getIdentity()
  const [nickname, setNickname] = useState(me.nickname)
  const [avatar, setAvatar] = useState(me.avatar)
  const [treeName, setTreeName] = useState('')
  const [theme, setTheme] = useState<TreeTheme>('classic')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Tree | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onUpload = async (f: File | undefined) => {
    if (!f) return
    try {
      setAvatar(await fileToAvatar(f))
      setError(null)
    } catch {
      setError('头像图片处理失败，换一张试试')
    }
  }

  const submit = async () => {
    const nickCheck = checkNickname(nickname)
    if (!nickCheck.ok) return setError(nickCheck.reason ?? '昵称不合适')
    const name = treeName.trim()
    if (name.length < 1) return setError('给你的树起个名字吧')
    if (name.length > 24) return setError('树名最多 24 字')
    setBusy(true)
    setError(null)
    try {
      saveIdentity({ id: me.id, nickname: nickname.trim(), avatar })
      const tree = await db.createTree({
        id: nanoid(8),
        ownerId: me.id,
        ownerNickname: nickname.trim(),
        ownerAvatar: avatar,
        name,
        theme,
      })
      setCreated(tree)
    } catch {
      setError('创建失败，请检查网络后重试')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const url = treeInviteUrl(created.id)
    return (
      <motion.div className="mx-auto max-w-md space-y-5 text-center" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-black">你的圣诞树种好啦！</h1>
        <div className="mx-auto w-52">
          <TreeCanvas theme={created.theme} />
        </div>
        <p className="text-sm text-frost-300">把专属链接发给好友，他们就能来爬「{created.name}」了。</p>
        <div className="glass rounded-3xl p-4 text-left">
          <ShareBar url={url} title={`我的圣诞树「${created.name}」`} />
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/tree/visit?id=${created.id}`)} className="btn-gold flex-1 rounded-2xl py-3 font-bold">
            去看看我的树
          </button>
          <button
            onClick={() => {
              setCreated(null)
              setTreeName('')
            }}
            className="btn-ghost flex-1 rounded-2xl py-3"
          >
            再种一棵
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-black">创建专属圣诞树</h1>
        <p className="mt-1 text-sm text-frost-300">填好资料，马上生成你的邀请链接。</p>
      </div>

      <section className="glass space-y-4 rounded-3xl p-5">
        <div>
          <label className="text-sm font-medium text-frost-300">你的昵称</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-3 text-sm outline-none focus:border-gold-400/60"
            placeholder="好友看到的名字"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-frost-300">选头像</label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition ${
                  avatar === a ? 'bg-gold-400/30 ring-2 ring-gold-400' : 'bg-white/8 hover:bg-white/15'
                }`}
              >
                {a}
              </button>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-xs transition ${
                avatar.startsWith('data:') ? 'ring-2 ring-gold-400' : 'bg-white/8 hover:bg-white/15'
              }`}
            >
              {avatar.startsWith('data:') ? <img src={avatar} alt="自定义头像" className="h-full w-full object-cover" /> : '上传'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0])} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-frost-300">圣诞树的名字</label>
          <input
            value={treeName}
            onChange={(e) => setTreeName(e.target.value)}
            maxLength={24}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-3 text-sm outline-none focus:border-gold-400/60"
            placeholder="比如：全村最高的树 / 星星许愿树"
          />
        </div>
      </section>

      <section>
        <div className="mb-2 text-sm font-medium text-frost-300">选个主题</div>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(THEMES) as TreeTheme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`glass rounded-3xl p-3 text-left transition ${theme === t ? 'ring-2 ring-gold-400' : 'opacity-80'}`}
            >
              <TreeCanvas theme={t} animated={false} />
              <div className="mt-1 text-sm font-bold">{THEMES[t].label}</div>
              <div className="text-[11px] leading-snug text-frost-300">{THEMES[t].desc}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="glass rounded-3xl p-4">
        <div className="mb-1 text-center text-sm text-frost-300">预览</div>
        <div className="mx-auto w-44">
          <TreeCanvas theme={theme} />
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-sm">
          <AvatarView avatar={avatar} size={26} />
          <span className="font-medium">{nickname || '我'}</span>
          <span className="text-frost-300">的</span>
          <span className="font-bold text-gold-300">{treeName || '未命名圣诞树'}</span>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-200">{error}</p>}

      <button onClick={submit} disabled={busy} className="btn-gold w-full rounded-2xl py-4 text-lg font-bold disabled:opacity-60">
        {busy ? '正在种树…' : '🌲 种下这棵树'}
      </button>
      <p className="text-center text-xs text-frost-300/70">
        已有树？去 <Link to="/profile" className="text-gold-300">个人中心</Link> 管理
      </p>
    </div>
  )
}
