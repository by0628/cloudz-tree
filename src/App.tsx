import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import Snowfall from './components/Snowfall'
import Home from './pages/Home'
import CreateTree from './pages/CreateTree'
import VisitTree from './pages/VisitTree'
import Leaderboard from './pages/Leaderboard'
import Profile from './pages/Profile'
import NotFound from './pages/NotFound'
import { db } from './lib/db'
import { adoptCloudId } from './lib/identity'

export default function App() {
  const [cloudError, setCloudError] = useState<string | null>(null)

  useEffect(() => {
    if (db.mode !== 'cloud') return
    void (async () => {
      try {
        const uid = await db.initCloudIdentity()
        if (uid) adoptCloudId(uid)
      } catch (e) {
        setCloudError(e instanceof Error ? e.message : '云端登录失败')
      }
    })()
  }, [])

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3.5 py-2 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-frost-300 hover:bg-white/8'}`

  return (
    <BrowserRouter>
      <div className="relative min-h-dvh overflow-x-clip bg-midnight-950">
        {/* 环境光背景 */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-midnight-700/50 blur-3xl" />
          <div className="absolute right-[-6rem] top-1/3 h-72 w-72 rounded-full bg-pine-600/15 blur-3xl" />
          <div className="absolute bottom-[-4rem] left-[-5rem] h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
        </div>
        <Snowfall />

        <header className="sticky top-0 z-30 border-b border-white/8 bg-midnight-950/75 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link to="/" className="flex items-center gap-2 font-black tracking-wide">
              <span className="text-2xl">🎄</span>
              <span>
                Cloudz <span className="text-gold-300">Tree</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navCls}>首页</NavLink>
              <NavLink to="/leaderboard" className={navCls}>排行榜</NavLink>
              <NavLink to="/profile" className={navCls}>我的</NavLink>
            </nav>
          </div>
        </header>

        {db.mode === 'demo' && (
          <div className="relative z-10 border-b border-gold-400/25 bg-gold-400/10 px-4 py-2 text-center text-xs text-gold-300">
            本地演示模式：未配置 Supabase，数据只保存在这台设备的浏览器里，邀请链接可在本机完整体验；接上 Supabase 后即为多人在线版（见 README）。
          </div>
        )}
        {cloudError && (
          <div className="relative z-10 border-b border-red-400/25 bg-red-400/10 px-4 py-2 text-center text-xs text-red-200">
            云端连接异常：{cloudError}
          </div>
        )}

        <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateTree />} />
            <Route path="/tree/visit" element={<VisitTree />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="relative z-10 pb-8 text-center text-xs text-frost-300/50">
          Cloudz Tree · 种一棵树，邀好友来爬 🎄
        </footer>
      </div>
    </BrowserRouter>
  )
}
