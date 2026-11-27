-- ============================================================================
--  선데이프리다이빙 PWA — Supabase 스키마 (v1.1.0)
--  Supabase Dashboard → SQL Editor → New query → 아래 전체를 붙여넣고 RUN
--  ※ 여러 번 실행해도 안전하도록 작성했습니다.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. 관리자 번호(PIN) 저장 테이블 (외부 읽기 차단)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('admin_pin', '0619')
on conflict (key) do nothing;

create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.app_settings
     where key = 'admin_pin' and value = coalesce(p_pin, '')
  );
$$;

grant execute on function public.verify_admin_pin(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. 수업일정 (누구나 열람, 관리자 번호 입력 시에만 추가/수정/삭제)
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
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists schedules_date_idx on public.schedules (class_date, start_time);

alter table public.schedules enable row level security;

drop policy if exists "schedules_read_all" on public.schedules;
create policy "schedules_read_all"
  on public.schedules for select
  to anon, authenticated
  using (true);

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

create or replace function public.admin_upsert_schedule(
  p_pin        text,
  p_id         uuid,
  p_title      text,
  p_class_date date,
  p_start_time text,
  p_end_time   text,
  p_location   text,
  p_level      text,
  p_capacity   integer,
  p_notes      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자 번호가 맞지 않습니다.';
  end if;

  if p_id is null then
    insert into public.schedules (title, class_date, start_time, end_time, location, level, capacity, notes)
    values (p_title, p_class_date, p_start_time, p_end_time, p_location, p_level, p_capacity, p_notes)
    returning id into v_id;
  else
    update public.schedules
       set title      = p_title,
           class_date = p_class_date,
           start_time = p_start_time,
           end_time   = p_end_time,
           location   = p_location,
           level      = p_level,
           capacity   = p_capacity,
           notes      = p_notes
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_schedule(p_pin text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자 번호가 맞지 않습니다.';
  end if;
  delete from public.schedules where id = p_id;
end;
$$;

grant execute on function public.admin_upsert_schedule(text, uuid, text, date, text, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.admin_delete_schedule(text, uuid) to anon, authenticated;

create or replace function public.upsert_schedule(
  p_id         uuid,
  p_title      text,
  p_class_date date,
  p_start_time text,
  p_end_time   text,
  p_location   text,
  p_level      text,
  p_capacity   integer,
  p_notes      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.schedules (title, class_date, start_time, end_time, location, level, capacity, notes)
    values (p_title, p_class_date, p_start_time, p_end_time, p_location, p_level, p_capacity, p_notes)
    returning id into v_id;
  else
    update public.schedules
       set title      = p_title,
           class_date = p_class_date,
           start_time = p_start_time,
           end_time   = p_end_time,
           location   = p_location,
           level      = p_level,
           capacity   = p_capacity,
           notes      = p_notes
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_schedule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.schedules where id = p_id;
end;
$$;

grant execute on function public.upsert_schedule(uuid, text, date, text, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.delete_schedule(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 버디 모집 글 (누구나 읽기/쓰기, 본인만 수정, 관리자만 삭제)
-- ---------------------------------------------------------------------------
create table if not exists public.buddy_posts (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null default '익명'
                 check (char_length(btrim(nickname)) between 1 and 20),
  content      text not null
                 check (char_length(btrim(content)) between 1 and 200),
  tag_date     date,
  tag_pool     text check (tag_pool is null or char_length(btrim(tag_pool)) between 1 and 30),
  author_token text,
  created_at   timestamptz not null default now()
);

alter table public.buddy_posts add column if not exists author_token text;
alter table public.buddy_posts add column if not exists avatar_url text;
alter table public.buddy_posts drop constraint if exists buddy_posts_tag_pool_check;
alter table public.buddy_posts add constraint buddy_posts_tag_pool_check
  check (tag_pool is null or char_length(btrim(tag_pool)) between 1 and 30);

create index if not exists buddy_posts_created_idx on public.buddy_posts (created_at desc);

alter table public.buddy_posts enable row level security;

drop policy if exists "posts_read_all"   on public.buddy_posts;
drop policy if exists "posts_insert_all" on public.buddy_posts;

create policy "posts_read_all"
  on public.buddy_posts for select
  to anon, authenticated
  using (true);

create policy "posts_insert_all"
  on public.buddy_posts for insert
  to anon, authenticated
  with check (
    char_length(btrim(content)) between 1 and 200
    and char_length(btrim(nickname)) between 1 and 20
    and (tag_pool is null or char_length(btrim(tag_pool)) between 1 and 30)
  );

create or replace function public.update_buddy_post(
  p_id       uuid,
  p_token    text,
  p_content  text,
  p_tag_date date,
  p_tag_pool text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.buddy_posts
     set content  = p_content,
         tag_date = p_tag_date,
         tag_pool = p_tag_pool
   where id = p_id
     and author_token is not null
     and author_token = p_token;

  if not found then
    raise exception '본인이 작성한 글만 수정할 수 있습니다.';
  end if;
end;
$$;

create or replace function public.admin_update_buddy_post(
  p_pin      text,
  p_id       uuid,
  p_content  text,
  p_tag_date date,
  p_tag_pool text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자만 수정할 수 있습니다.';
  end if;

  update public.buddy_posts
     set content  = p_content,
         tag_date = p_tag_date,
         tag_pool = p_tag_pool
   where id = p_id;
end;
$$;

create or replace function public.admin_delete_buddy_post(p_pin text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.buddy_posts where id = p_id;
end;
$$;

grant execute on function public.update_buddy_post(uuid, text, text, date, text) to anon, authenticated;
grant execute on function public.admin_update_buddy_post(text, uuid, text, date, text) to anon, authenticated;
grant execute on function public.admin_delete_buddy_post(text, uuid) to anon, authenticated;

create or replace function public.delete_buddy_post(p_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.buddy_posts
   where id = p_id
     and author_token is not null
     and author_token = p_token;

  if not found then
    raise exception '본인이 작성한 글만 삭제할 수 있습니다.';
  end if;
end;
$$;

grant execute on function public.delete_buddy_post(uuid, text) to anon, authenticated;

create or replace function public.sync_my_avatar(p_token text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or char_length(btrim(p_token)) = 0 then
    return;
  end if;
  update public.buddy_posts
     set avatar_url = nullif(p_avatar_url, '')
   where author_token = p_token;
end;
$$;

create or replace function public.admin_sync_brand_avatar(p_pin text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자만 동기화할 수 있습니다.';
  end if;

  insert into public.app_settings (key, value)
  values ('brand_avatar', coalesce(p_avatar_url, ''))
  on conflict (key) do update set value = excluded.value;

  update public.buddy_posts
     set avatar_url = nullif(p_avatar_url, '')
   where nickname = '선데이프리다이빙';
end;
$$;

create or replace function public.fill_brand_avatar_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar text;
begin
  if new.nickname = '선데이프리다이빙' and (new.avatar_url is null or new.avatar_url = '') then
    select value into v_avatar from public.app_settings where key = 'brand_avatar';
    if v_avatar is not null and v_avatar <> '' then
      new.avatar_url := v_avatar;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists buddy_posts_fill_brand_avatar on public.buddy_posts;
create trigger buddy_posts_fill_brand_avatar
  before insert on public.buddy_posts
  for each row execute function public.fill_brand_avatar_on_insert();

grant execute on function public.sync_my_avatar(text, text) to anon, authenticated;
grant execute on function public.admin_sync_brand_avatar(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 버디 댓글 (누구나 읽기/쓰기, 관리자만 삭제)
-- ---------------------------------------------------------------------------
create table if not exists public.buddy_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.buddy_posts (id) on delete cascade,
  nickname   text not null default '익명'
               check (char_length(btrim(nickname)) between 1 and 20),
  content    text not null
               check (char_length(btrim(content)) between 1 and 150),
  created_at timestamptz not null default now()
);

create index if not exists buddy_comments_post_idx on public.buddy_comments (post_id, created_at);

alter table public.buddy_comments enable row level security;

drop policy if exists "comments_read_all"   on public.buddy_comments;
drop policy if exists "comments_insert_all" on public.buddy_comments;

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

create or replace function public.admin_delete_buddy_comment(p_pin text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_pin(p_pin) then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.buddy_comments where id = p_id;
end;
$$;

grant execute on function public.admin_delete_buddy_comment(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. 사용자별 개인 데이터 (v1.4.2 · 로그인하면 기기 간 자동 동기화)
--    · 로그인한 계정(auth.uid())만 자기 행을 읽고/쓸 수 있습니다.
--    · key : sfd.prefs / sfd.history / sfd.logbook / sfd.eq / sfd.licensePhoto
--    · client_updated_at : 기기에서 값을 바꾼 시각(ms). 충돌은 최신 값 우선
-- ---------------------------------------------------------------------------
create table if not exists public.user_state (
  user_id           uuid not null references auth.users (id) on delete cascade,
  key               text not null
                      check (key in ('sfd.prefs', 'sfd.history', 'sfd.logbook', 'sfd.eq', 'sfd.licensePhoto')),
  value             jsonb,
  client_updated_at bigint not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_state add column if not exists client_updated_at bigint not null default 0;
alter table public.user_state add column if not exists updated_at timestamptz not null default now();

create index if not exists user_state_user_idx on public.user_state (user_id);

alter table public.user_state enable row level security;

revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;
grant all on public.user_state to service_role;

drop policy if exists "user_state_select_own" on public.user_state;
drop policy if exists "user_state_insert_own" on public.user_state;
drop policy if exists "user_state_update_own" on public.user_state;
drop policy if exists "user_state_delete_own" on public.user_state;

create policy "user_state_select_own"
  on public.user_state for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_state_insert_own"
  on public.user_state for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_state_update_own"
  on public.user_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_state_delete_own"
  on public.user_state for delete
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists user_state_touch_updated_at on public.user_state;
create trigger user_state_touch_updated_at
  before update on public.user_state
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. 기본 권한
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.schedules to anon, authenticated;
grant select, insert on public.buddy_posts to anon, authenticated;
grant select, insert on public.buddy_comments to anon, authenticated;
