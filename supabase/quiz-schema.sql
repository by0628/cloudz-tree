-- ============================================================
-- Cloudz Tree · 个人问答系统（增量迁移，可重复执行）
-- 用法：Supabase 控制台 → SQL Editor 整段执行一次。
-- 说明：只新增 quiz_* 表与函数，不修改、不删除任何已有表和数据。
-- 安全模型：
--   - 题目公开可读，但正确答案单独存 quiz_answers，仅出题人可读写；
--   - 答题提交只能走 submit_quiz_attempt RPC：服务端按 auth.uid() 记录
--     答题人、服务端比对答案计分，客户端无法伪造身份或分数；
--   - 答题记录仅答题人本人与出题人可读（严格隔离）。
-- ============================================================

-- ---------- 问答档案（每位用户一份） ----------
create table if not exists public.quiz_profiles (
  id text primary key,
  owner_id uuid not null,
  owner_nickname text not null,
  owner_avatar text not null default '🦊',
  title text not null check (char_length(title) between 1 and 40),
  intro text not null default '' check (char_length(intro) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quiz_profiles_owner on public.quiz_profiles (owner_id);

-- ---------- 题目（不含正确答案） ----------
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.quiz_profiles (id) on delete cascade,
  sort int not null default 0,
  text text not null check (char_length(text) between 1 and 120),
  image_url text check (image_url is null or char_length(image_url) <= 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_questions_profile on public.quiz_questions (profile_id, sort);

-- ---------- 正确答案（仅出题人可读写） ----------
create table if not exists public.quiz_answers (
  question_id uuid primary key references public.quiz_questions (id) on delete cascade,
  correct_index int not null check (correct_index >= 0 and correct_index < 6)
);

-- ---------- 答题记录（只经 RPC 写入） ----------
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.quiz_profiles (id) on delete cascade,
  taker_id uuid not null,
  taker_nickname text not null,
  score int not null check (score >= 0),
  total int not null check (total > 0),
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_attempts_profile on public.quiz_attempts (profile_id, created_at desc);
create index if not exists idx_quiz_attempts_taker on public.quiz_attempts (taker_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.quiz_profiles enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_attempts enable row level security;

-- quiz_profiles：公开读；仅本人可写
drop policy if exists "quiz_profiles_select" on public.quiz_profiles;
create policy "quiz_profiles_select" on public.quiz_profiles for select using (true);
drop policy if exists "quiz_profiles_insert" on public.quiz_profiles;
create policy "quiz_profiles_insert" on public.quiz_profiles for insert with check (owner_id = auth.uid());
drop policy if exists "quiz_profiles_update" on public.quiz_profiles;
create policy "quiz_profiles_update" on public.quiz_profiles for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "quiz_profiles_delete" on public.quiz_profiles;
create policy "quiz_profiles_delete" on public.quiz_profiles for delete using (owner_id = auth.uid());

-- quiz_questions：公开读；仅档案主人可写
drop policy if exists "quiz_questions_select" on public.quiz_questions;
create policy "quiz_questions_select" on public.quiz_questions for select using (true);
drop policy if exists "quiz_questions_insert" on public.quiz_questions;
create policy "quiz_questions_insert" on public.quiz_questions for insert with check (
  exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
drop policy if exists "quiz_questions_update" on public.quiz_questions;
create policy "quiz_questions_update" on public.quiz_questions for update using (
  exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
drop policy if exists "quiz_questions_delete" on public.quiz_questions;
create policy "quiz_questions_delete" on public.quiz_questions for delete using (
  exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
);

-- quiz_answers：仅出题人可读写（好友端永远读不到正确答案）
drop policy if exists "quiz_answers_all" on public.quiz_answers;
create policy "quiz_answers_all" on public.quiz_answers for all using (
  exists (
    select 1 from public.quiz_questions q
    join public.quiz_profiles p on p.id = q.profile_id
    where q.id = question_id and p.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.quiz_questions q
    join public.quiz_profiles p on p.id = q.profile_id
    where q.id = question_id and p.owner_id = auth.uid()
  )
);

-- quiz_attempts：无直接 insert 策略（只能经 RPC 提交）；
-- 读取仅限答题人本人或出题人；删除同理。
drop policy if exists "quiz_attempts_select" on public.quiz_attempts;
create policy "quiz_attempts_select" on public.quiz_attempts for select using (
  taker_id = auth.uid()
  or exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
);
drop policy if exists "quiz_attempts_delete" on public.quiz_attempts;
create policy "quiz_attempts_delete" on public.quiz_attempts for delete using (
  taker_id = auth.uid()
  or exists (select 1 from public.quiz_profiles p where p.id = profile_id and p.owner_id = auth.uid())
);

-- ============================================================
-- 服务端计分：提交答题（身份取 auth.uid()，分数服务端计算）
-- ============================================================
create or replace function public.submit_quiz_attempt(p_profile_id text, p_answers int[], p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q_count int;
  v_score int := 0;
  v_attempt_id uuid;
  v_review jsonb := '[]'::jsonb;
  rec record;
  i int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.quiz_profiles where id = p_profile_id) then
    raise exception 'quiz not found';
  end if;
  select count(*) into q_count from public.quiz_questions where profile_id = p_profile_id;
  if q_count = 0 then
    raise exception 'quiz has no questions';
  end if;
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> q_count then
    raise exception 'answers length mismatch';
  end if;
  for rec in
    select q.id as qid, a.correct_index as ci
    from public.quiz_questions q
    join public.quiz_answers a on a.question_id = q.id
    where q.profile_id = p_profile_id
    order by q.sort asc, q.created_at asc
  loop
    i := i + 1;
    if p_answers[i] = rec.ci then
      v_score := v_score + 1;
    end if;
    v_review := v_review || jsonb_build_object('question_id', rec.qid, 'chosen', p_answers[i], 'correct_index', rec.ci);
  end loop;
  if i <> q_count then
    raise exception 'some questions have no answer key';
  end if;
  insert into public.quiz_attempts (profile_id, taker_id, taker_nickname, score, total, answers)
  values (
    p_profile_id,
    auth.uid(),
    left(coalesce(nullif(trim(p_nickname), ''), '匿名访客'), 16),
    v_score,
    q_count,
    to_jsonb(p_answers)
  )
  returning id into v_attempt_id;
  return jsonb_build_object('attempt_id', v_attempt_id, 'score', v_score, 'total', q_count, 'review', v_review);
end;
$$;
grant execute on function public.submit_quiz_attempt(text, int[], text) to anon, authenticated;

-- ============================================================
-- 答题详情（逐题对错）：仅答题人本人或出题人可取
-- ============================================================
create or replace function public.get_quiz_review(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att record;
  prof_owner uuid;
  v_review jsonb := '[]'::jsonb;
  rec record;
  i int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into att from public.quiz_attempts where id = p_attempt_id;
  if att is null then
    raise exception 'attempt not found';
  end if;
  select owner_id into prof_owner from public.quiz_profiles where id = att.profile_id;
  if auth.uid() <> att.taker_id and auth.uid() <> prof_owner then
    raise exception 'not allowed';
  end if;
  for rec in
    select q.id as qid, q.text as qtext, q.image_url as qimg, q.options as qopts, a.correct_index as ci
    from public.quiz_questions q
    join public.quiz_answers a on a.question_id = q.id
    where q.profile_id = att.profile_id
    order by q.sort asc, q.created_at asc
  loop
    i := i + 1;
    v_review := v_review || jsonb_build_object(
      'question_id', rec.qid,
      'text', rec.qtext,
      'image_url', rec.qimg,
      'options', rec.qopts,
      'chosen', (att.answers ->> (i - 1))::int,
      'correct_index', rec.ci
    );
  end loop;
  return jsonb_build_object(
    'attempt_id', att.id,
    'profile_id', att.profile_id,
    'taker_nickname', att.taker_nickname,
    'score', att.score,
    'total', att.total,
    'review', v_review
  );
end;
$$;
grant execute on function public.get_quiz_review(uuid) to anon, authenticated;
