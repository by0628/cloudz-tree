-- ============================================================
-- Cloudz Tree · Supabase 数据库结构 + RLS
-- 用法：在 Supabase 控制台 → SQL Editor 里整段执行一次。
-- 前置：Authentication → Sign In / Providers 里开启
--       「Allow anonymous sign-ins」（前端用匿名登录拿 auth.uid()）。
-- 前端只使用 anon key；service role key 绝不要放进前端。
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 用户资料 ----------
create table if not exists public.profiles (
  id uuid primary key,
  nickname text not null check (char_length(nickname) between 1 and 16),
  avatar text not null default '🦊',
  created_at timestamptz not null default now()
);

-- ---------- 圣诞树 ----------
create table if not exists public.trees (
  id text primary key,
  owner_id uuid not null,
  owner_nickname text not null,
  owner_avatar text not null default '🦊',
  name text not null check (char_length(name) between 1 and 24),
  theme text not null default 'classic' check (theme in ('classic', 'ice', 'candy')),
  created_at timestamptz not null default now()
);
create index if not exists idx_trees_owner on public.trees (owner_id);
create index if not exists idx_trees_created on public.trees (created_at desc);

-- ---------- 游戏记录 ----------
create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  tree_id text not null references public.trees (id) on delete cascade,
  player_id uuid not null,
  player_nickname text not null,
  score int not null check (score >= 0),
  height_m numeric(7, 1) not null check (height_m >= 0),
  stars int not null default 0 check (stars >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_records_tree_score on public.game_records (tree_id, score desc);
create index if not exists idx_records_player on public.game_records (player_id, created_at desc);
create index if not exists idx_records_score on public.game_records (score desc);

-- ---------- 留言 ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tree_id text not null references public.trees (id) on delete cascade,
  author_id uuid not null,
  author_nickname text not null,
  content text not null check (char_length(content) between 1 and 200),
  reports int not null default 0 check (reports >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_tree on public.messages (tree_id, created_at desc);

-- ---------- 访问记录 ----------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  tree_id text not null references public.trees (id) on delete cascade,
  visitor_id uuid not null,
  visitor_nickname text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_tree on public.visits (tree_id, created_at desc);

-- ============================================================
-- Row Level Security
-- 规则：公开内容任何人可读；写操作必须以本人 auth.uid() 进行；
--       只能改/删自己的数据；留言被举报满 3 次后不再对外可见。
-- ============================================================
alter table public.profiles enable row level security;
alter table public.trees enable row level security;
alter table public.game_records enable row level security;
alter table public.messages enable row level security;
alter table public.visits enable row level security;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- trees
drop policy if exists "trees_select" on public.trees;
create policy "trees_select" on public.trees for select using (true);
drop policy if exists "trees_insert" on public.trees;
create policy "trees_insert" on public.trees for insert with check (owner_id = auth.uid());
drop policy if exists "trees_update" on public.trees;
create policy "trees_update" on public.trees for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "trees_delete" on public.trees;
create policy "trees_delete" on public.trees for delete using (owner_id = auth.uid());

-- game_records
drop policy if exists "records_select" on public.game_records;
create policy "records_select" on public.game_records for select using (true);
drop policy if exists "records_insert" on public.game_records;
create policy "records_insert" on public.game_records for insert with check (player_id = auth.uid());
drop policy if exists "records_delete" on public.game_records;
create policy "records_delete" on public.game_records for delete using (player_id = auth.uid());

-- messages（select 排除已被举报隐藏的）
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select using (reports < 3);
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert with check (author_id = auth.uid());
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages for delete using (author_id = auth.uid());

-- visits
drop policy if exists "visits_select" on public.visits;
create policy "visits_select" on public.visits for select using (true);
drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert" on public.visits for insert with check (visitor_id = auth.uid());

-- ---------- 举报函数（绕过 update 权限，安全地只做 +1） ----------
create or replace function public.report_message(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages set reports = reports + 1 where id = target;
$$;
grant execute on function public.report_message(uuid) to anon, authenticated;
