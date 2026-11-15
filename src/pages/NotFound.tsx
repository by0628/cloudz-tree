import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center">
      <div className="text-5xl">🎄💨</div>
      <h1 className="mt-3 text-xl font-bold">走错雪路了</h1>
      <p className="mt-2 text-sm text-frost-300">这个页面不存在，回到雪原入口看看吧。</p>
      <Link to="/" className="btn-gold mt-5 inline-block rounded-2xl px-6 py-3 font-bold">回首页</Link>
    </div>
  )
}
