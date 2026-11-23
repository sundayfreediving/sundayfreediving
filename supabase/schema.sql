-- ============================================================================
--  선데이프리다이빙 PWA — Supabase 스키마
--  Supabase Dashboard → SQL Editor → New query → 아래 전체를 붙여넣고 RUN
--  ※ 여러 번 실행해도 안전하도록 작성했습니다.
-- ============================================================================
--
--  테이블
--    · schedules       수업일정 (관리자만 쓰기)
--    · buddy_posts     버디 모집 한 줄 글 (누구나 읽기/쓰기)
--    · buddy_comments  버디 글 댓글 (누구나 읽기/쓰기)
--
--  관리자 판별: 로그인한 사용자의 이메일이 아래 ADMIN_EMAIL 과 같은 경우만
--  수업일정을 추가/수정/삭제할 수 있습니다. (앱의 config.js ADMIN_EMAIL과 동일)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. 관리자 판별 함수
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'sundayfreediving@gmail.com',
    false
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. 수업일정
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  class_date  date not null,
  start_time  text not null default '19:00'
                check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time    text
                check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location    text not null default 'K26'
                check (char_length(location) between 1 and 40),
  level       text not null default 'AIDA2'
                check (char_length(level) between 1 and 20),
  capacity    integer check (capacity is null or (capacity >= 0 and capacity <= 99)),
  notes       text check (notes is null or char_length(notes) <= 500),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists schedules_date_idx on public.schedules (class_date, start_time);

alter table public.schedules enable row level security;

drop policy if exists "schedules_read_all"   on public.schedules;
drop policy if exists "schedules_admin_add"  on public.schedules;
drop policy if exists "schedules_admin_edit" on public.schedules;
drop policy if exists "schedules_admin_del"  on public.schedules;

-- 누구나(비로그인 포함) 수업일정을 볼 수 있음
create policy "schedules_read_all"
  on public.schedules for select
  to anon, authenticated
  using (true);

-- 관리자만 추가
create policy "schedules_admin_add"
  on public.schedules for insert
  to authenticated
  with check (public.is_admin());

-- 관리자만 수정
create policy "schedules_admin_edit"
  on public.schedules for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 관리자만 삭제
create policy "schedules_admin_del"
  on public.schedules for delete
  to authenticated
  using (public.is_admin());

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 버디 모집 글
-- ---------------------------------------------------------------------------
create table if not exists public.buddy_posts (
  id          uuid primary key default gen_random_uuid(),
  nickname    text not null default '익명'
                check (char_length(btrim(nickname)) between 1 and 20),
  content     text not null
                check (char_length(btrim(content)) between 1 and 200),
  tag_date    date,
  tag_pool    text check (tag_pool is null or tag_pool in ('K26', '잠실', '딥스테이션', '보홀', '기타')),
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists buddy_posts_created_idx on public.buddy_posts (created_at desc);

alter table public.buddy_posts enable row level security;

drop policy if exists "posts_read_all"     on public.buddy_posts;
drop policy if exists "posts_insert_all"   on public.buddy_posts;
drop policy if exists "posts_delete_admin" on public.buddy_posts;

-- 누구나 읽기
create policy "posts_read_all"
  on public.buddy_posts for select
  to anon, authenticated
  using (true);

-- 누구나 쓰기 (내용 길이/형식은 테이블 check 로 제한)
create policy "posts_insert_all"
  on public.buddy_posts for insert
  to anon, authenticated
  with check (
    char_length(btrim(content)) between 1 and 200
    and char_length(btrim(nickname)) between 1 and 20
    and (tag_pool is null or tag_pool in ('K26', '잠실', '딥스테이션', '보홀', '기타'))
  );

-- 삭제는 관리자 또는 로그인한 작성자 본인만
create policy "posts_delete_admin"
  on public.buddy_posts for delete
  to authenticated
  using (public.is_admin() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. 버디 댓글
-- ---------------------------------------------------------------------------
create table if not exists public.buddy_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.buddy_posts (id) on delete cascade,
  nickname    text not null default '익명'
                check (char_length(btrim(nickname)) between 1 and 20),
  content     text not null
                check (char_length(btrim(content)) between 1 and 150),
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists buddy_comments_post_idx on public.buddy_comments (post_id, created_at);

alter table public.buddy_comments enable row level security;

drop policy if exists "comments_read_all"     on public.buddy_comments;
drop policy if exists "comments_insert_all"   on public.buddy_comments;
drop policy if exists "comments_delete_admin" on public.buddy_comments;

create policy "comments_read_all"
  on public.buddy_comments for select
  to anon, authenticated
  using (true);

create policy "comments_insert_all"
  on public.buddy_comments for insert
  to anon, authenticated
  with check (
    char_length(btrim(content)) between 1 and 150
    and char_length(btrim(nickname)) between 1 and 20
  );

create policy "comments_delete_admin"
  on public.buddy_comments for delete
  to authenticated
  using (public.is_admin() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. 권한 (RLS 와 별개로 테이블 접근 권한 부여)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.schedules to anon, authenticated;
grant insert, update, delete on public.schedules to authenticated;

grant select, insert on public.buddy_posts to anon, authenticated;
grant delete on public.buddy_posts to authenticated;

grant select, insert on public.buddy_comments to anon, authenticated;
grant delete on public.buddy_comments to authenticated;

-- ---------------------------------------------------------------------------
-- 5. (선택) 샘플 수업일정 — 필요할 때만 주석을 풀어 실행하세요.
-- ---------------------------------------------------------------------------
-- insert into public.schedules (title, class_date, start_time, end_time, location, level, capacity, notes)
-- values
--   ('AIDA2 코스 1일차', current_date + 1, '19:00', '22:00', 'K26', 'AIDA2', 4, '이론 40분 + 풀 세션. 교재, 수영복 지참.'),
--   ('AIDA3 딥다이브',  current_date + 2, '10:00', '17:00', '딥스테이션', 'AIDA3', 6, '08:00 잠실 출발 · 차량 2대'),
--   ('자율연습',        current_date + 4, '19:00', '21:00', 'K26', '자율연습', 8, '버디 페어로 진행합니다.');

-- ---------------------------------------------------------------------------
-- 확인용: 아래 쿼리로 정책이 잘 걸렸는지 볼 수 있습니다.
-- ---------------------------------------------------------------------------
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' order by tablename, cmd;
