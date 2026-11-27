-- ============================================================================
--  선데이프리다이빙 PWA — Supabase 스키마 (v1.4.4)
--  Supabase Dashboard → SQL Editor → New query → 아래 전체를 붙여넣고 RUN
--  ※ 여러 번 실행해도 안전하도록 작성했습니다.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. 앱 설정값 (외부 읽기 차단) + 관리자 판별
--    v1.4.4: 관리자 번호(PIN) 폐지 → sundayfreediving@gmail.com 로그인 세션 기준
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

alter table public.app_settings enable row level security;

-- v1.4.4: 예전 PIN 값과 PIN 확인 함수를 정리합니다.
update public.app_settings set value = '' where key = 'admin_pin';
delete from public.app_settings where key = 'admin_pin';
drop function if exists public.verify_admin_pin(text);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and lower(u.email) = 'sundayfreediving@gmail.com'
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'sundayfreediving@gmail.com';
$$;

grant execute on function public.is_admin() to anon, authenticated;

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
  if not public.is_admin() then
    raise exception '관리자만 일정을 바꿀 수 있습니다.';
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

-- 예전 PIN 기반 서명은 남기지 않습니다.
drop function if exists public.admin_upsert_schedule(text, uuid, text, date, text, text, text, text, integer, text);
drop function if exists public.admin_delete_schedule(text, uuid);

grant execute on function public.admin_upsert_schedule(uuid, text, date, text, text, text, text, integer, text) to authenticated;

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
  if not public.is_admin() then
    raise exception '관리자만 일정을 바꿀 수 있습니다.';
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

create or replace function public.delete_schedule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 일정을 삭제할 수 있습니다.';
  end if;
  delete from public.schedules where id = p_id;
end;
$$;

grant execute on function public.upsert_schedule(uuid, text, date, text, text, text, text, integer, text) to authenticated;
grant execute on function public.delete_schedule(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1-B. 일정 신청 (v1.4.4)
--      · 읽기: 누구나 (달력에 신청자 이름 표시)
--      · 쓰기: SECURITY DEFINER RPC 로만
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_registrations (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 20),
  created_at  timestamptz not null default now(),
  unique (schedule_id, user_id)
);

create index if not exists schedule_registrations_schedule_idx
  on public.schedule_registrations (schedule_id, created_at);

alter table public.schedule_registrations enable row level security;

revoke all on public.schedule_registrations from anon, authenticated;
grant select on public.schedule_registrations to anon, authenticated;
grant all on public.schedule_registrations to service_role;

drop policy if exists "registrations_read_all" on public.schedule_registrations;
create policy "registrations_read_all"
  on public.schedule_registrations for select
  to anon, authenticated
  using (true);

create or replace function public.register_schedule(p_schedule_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_cap   integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if char_length(v_name) < 1 then
    raise exception '신청자 이름을 입력해 주세요.';
  end if;
  if char_length(v_name) > 20 then
    raise exception '이름은 20자까지 입력할 수 있습니다.';
  end if;

  -- 정원 확인 중 동시 신청으로 정원을 넘지 않도록 일정 행을 잠급니다.
  select capacity into v_cap
    from public.schedules
   where id = p_schedule_id
     for update;

  if not found then
    raise exception '일정을 찾지 못했습니다.';
  end if;

  if v_cap is not null
     and not exists (
       select 1 from public.schedule_registrations
        where schedule_id = p_schedule_id and user_id = v_uid
     ) then
    select count(*) into v_count
      from public.schedule_registrations
     where schedule_id = p_schedule_id;
    if v_count >= v_cap then
      raise exception '정원이 마감되었습니다.';
    end if;
  end if;

  insert into public.schedule_registrations (schedule_id, user_id, name)
  values (p_schedule_id, v_uid, v_name)
  on conflict (schedule_id, user_id) do update set name = excluded.name;
end;
$$;

create or replace function public.cancel_schedule_registration(
  p_schedule_id uuid,
  p_user_id     uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid := coalesce(p_user_id, v_uid);
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if v_target <> v_uid and not public.is_admin() then
    raise exception '본인 신청만 취소할 수 있습니다.';
  end if;

  delete from public.schedule_registrations
   where schedule_id = p_schedule_id
     and user_id = v_target;

  if not found then
    raise exception '신청 내역이 없습니다.';
  end if;
end;
$$;

grant execute on function public.register_schedule(uuid, text) to authenticated;
grant execute on function public.cancel_schedule_registration(uuid, uuid) to authenticated;

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
  if not public.is_admin() then
    raise exception '관리자만 수정할 수 있습니다.';
  end if;

  update public.buddy_posts
     set content  = p_content,
         tag_date = p_tag_date,
         tag_pool = p_tag_pool
   where id = p_id;
end;
$$;

create or replace function public.admin_delete_buddy_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.buddy_posts where id = p_id;
end;
$$;

-- 예전 PIN 기반 서명은 남기지 않습니다.
drop function if exists public.admin_update_buddy_post(text, uuid, text, date, text);
drop function if exists public.admin_delete_buddy_post(text, uuid);

grant execute on function public.admin_update_buddy_post(uuid, text, date, text) to authenticated;
grant execute on function public.admin_delete_buddy_post(uuid) to authenticated;

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

create or replace function public.admin_sync_brand_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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
grant execute on function public.admin_sync_brand_avatar(text) to authenticated;
drop function if exists public.admin_sync_brand_avatar(text, text);

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

create or replace function public.admin_delete_buddy_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 삭제할 수 있습니다.';
  end if;
  delete from public.buddy_comments where id = p_id;
end;
$$;

drop function if exists public.admin_delete_buddy_comment(text, uuid);

grant execute on function public.admin_delete_buddy_comment(uuid) to authenticated;

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
--    v1.4.4: 일정은 SELECT 만 공개, 쓰기는 관리자 RPC 전용
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.schedules to anon, authenticated;
revoke insert, update, delete on public.schedules from anon, authenticated;
grant select, insert on public.buddy_posts to anon, authenticated;
revoke update, delete on public.buddy_posts from anon, authenticated;
grant select, insert on public.buddy_comments to anon, authenticated;
revoke update, delete on public.buddy_comments from anon, authenticated;
