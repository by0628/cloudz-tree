# Cloudz Tree · 互动圣诞树 🎄

创建一个属于你的圣诞树，生成专属邀请链接发给好友——好友通过链接来爬你的树、冲排行榜、留祝福；你也能看到谁来过、谁爬得最高。

视觉与玩法参考了同类社交圣诞树小游戏的思路，代码、素材与品牌均为原创实现。

## 功能一览

- **首页**：主视觉圣诞树（Canvas 分层渲染 + 彩灯动画 + 全屏雪花）、创建入口、邀请链接直达、最新树木列表
- **创建圣诞树**：昵称、头像（预设表情或上传图片自动裁剪压缩）、树名、3 种主题（经典暖冬 / 冰雪秘境 / 糖果派对，实时预览）
- **邀请机制**：每棵树生成唯一随机 ID 与专属链接 `/tree/visit?id=xxxx`，支持一键复制与系统分享（Web Share API）
- **攀爬游戏**：Canvas 竖屏游戏——按住屏幕左右半边或用方向键移动，躲树枝与掉落的雪球/装饰球，收集星星，3 颗心，难度随高度递增；支持开始 / 暂停（切后台自动暂停）/ 结束结算 / 重开，成绩自动保存并计算本树排名
- **好友互动**：访问记录（同会话防重复计数）、每棵树的成绩榜、留言（敏感词与广告过滤、删除自己的留言、举报满 3 次自动隐藏）、全局排行榜
- **个人中心**：改昵称/头像、我的树（数据统计 + 分享 + 删除）、我的成绩、我的树收到的留言与访客
- **异常状态**：树不存在的友好错误页、网络错误提示、空数据状态、加载状态，均为真实逻辑

## 技术栈

React + TypeScript + Vite · Tailwind CSS v4 · Framer Motion · Canvas 游戏引擎 · Supabase（Postgres + 匿名登录 + RLS）· 部署目标 Cloudflare Pages

## 快速开始（本地演示模式）

```bash
npm install
npm run dev
```

不配置任何环境变量时，站点自动进入**本地演示模式**：全部功能可玩（种树、邀请链接、游戏、留言、排行榜），但数据只保存在当前浏览器的 localStorage，**不是多人共享**——页面顶部会有黄色提示条。演示模式内置了一棵种子树（ID：`demo-tree`）方便直接体验访问页。

## 接入 Supabase（多人在线版）

1. 在 [supabase.com](https://supabase.com) 新建一个项目。
2. 控制台 **SQL Editor** → 粘贴执行 [`supabase/schema.sql`](supabase/schema.sql)（建表 + 索引 + RLS + 举报函数，一次执行完）。
3. 控制台 **Authentication → Sign In / Providers** → 开启 **Allow anonymous sign-ins**（前端用匿名登录获得 `auth.uid()`，RLS 靠它校验数据归属）。
4. 控制台 **Project Settings → API** → 复制 `Project URL` 与 `anon public key`。
5. 复制 `.env.example` 为 `.env.local`，填入上面两个值，重新 `npm run dev` / 构建。页面顶部演示提示条消失即表示已连上云端。

> 安全：前端只使用 anon key。**service_role key 绝不要**写进前端代码、`.env.local` 或提交到仓库。所有权限边界由 `schema.sql` 里的 RLS 策略保证：公开内容可读，写操作必须是本人 uid，留言被举报 ≥3 次自动隐藏。

## 部署到 Cloudflare Pages

1. 把本仓库推到 GitHub。
2. Cloudflare 控制台 → Workers & Pages → Create → Pages → 连接该仓库。
3. 构建设置：Framework 预设选 **Vite**（构建命令 `npm run build`，输出目录 `dist`）。
4. 环境变量里添加 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（与本地一致），重新部署生效。
5. 仓库已包含 `public/_redirects`（`/* /index.html 200`），保证 `/tree/visit?id=...` 这类 SPA 路由直达不 404。

也可以部署到任何静态托管（GitHub Pages、Netlify 等），注意同样要配 SPA fallback 与两个环境变量。

## 项目结构

```
src/
  lib/        数据层：db.ts（接口与适配器选择）、dbLocal.ts（演示）、dbSupabase.ts（云端）、
              identity.ts（本地身份/云端 uid 对接）、moderation.ts（内容审核）、types.ts、format.ts
  game/       engine.ts（攀爬游戏引擎）、GameScreen.tsx（游戏界面与成绩提交）
  components/ Snowfall（雪花背景）、TreeCanvas（装饰圣诞树）、ShareBar（复制/分享）
  pages/      Home / CreateTree / VisitTree / Leaderboard / Profile / NotFound
supabase/
  schema.sql  建表 + RLS + report_message 函数
public/
  _redirects  Cloudflare Pages SPA 回退
```

## 数据模型

| 表 | 说明 |
|---|---|
| `profiles` | 用户资料（id = 匿名登录 uid，昵称、头像） |
| `trees` | 圣诞树（短 ID 主键、树主快照、名称、主题） |
| `game_records` | 游戏成绩（分数、高度、星星） |
| `messages` | 树下留言（reports ≥ 3 自动隐藏） |
| `visits` | 访问记录 |

## 开发命令

```bash
npm run dev       # 本地开发
npm run build     # 类型检查 + 生产构建
npm run preview   # 预览生产构建
```
