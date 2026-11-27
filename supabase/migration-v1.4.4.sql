-- ============================================================================
--  선데이프리다이빙 PWA — v1.4.4 마이그레이션
--  · 관리자 PIN 제거 → sundayfreediving@gmail.com 로그인 세션 기반
--  · 일정 신청/취소 (schedule_registrations + RPC)
--  ※ 여러 번 실행해도 안전합니다.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0. 관리자 판별 — 이메일 기반 (PIN 폐지)
-- ---------------------------------------------------------------------------
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

-- PIN 관련 함수·값 정리
drop function if exists public.verify_admin_pin(text);
delete from public.app_settings where key = 'admin_pin';

-- ---------------------------------------------------------------------------
-- 1. 일정 신청 (schedule_registrations)
--    · 읽기: 누구나 (달력에 신청자 이름 표시)
--    · 쓰기: SECURITY DEFINER RPC 로만 (직접 insert/update/delete 차단)
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

-- 신청 -----------------------------------------------------------------------
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

  -- 같은 일정에 동시에 신청이 몰려도 정원을 넘지 않도록 일정 행을 잠급니다.
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

-- 취소 (본인 또는 관리자) ------------------------------------------------------
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
-- 2. 일정 추가·수정·삭제 — 관리자 계정 세션만
-- ---------------------------------------------------------------------------
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
    if v_id is null then
      raise exception '일정을 찾지 못했습니다.';
    end if;
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
  if not found then
    raise exception '일정을 찾지 못했습니다.';
  end if;
end;
$$;

-- PIN 기반 관리자 함수 정리
drop function if exists public.admin_upsert_schedule(text, uuid, text, date, text, text, text, text, integer, text);
drop function if exists public.admin_delete_schedule(text, uuid);

grant execute on function public.upsert_schedule(uuid, text, date, text, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.delete_schedule(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 버디 글·댓글 관리자 기능 — PIN → 이메일 세션
-- ---------------------------------------------------------------------------
drop function if exists public.admin_update_buddy_post(text, uuid, text, date, text);
drop function if exists public.admin_delete_buddy_post(text, uuid);
drop function if exists public.admin_delete_buddy_comment(text, uuid);
drop function if exists public.admin_sync_brand_avatar(text, text);

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

grant execute on function public.admin_update_buddy_post(uuid, text, date, text) to authenticated;
grant execute on function public.admin_delete_buddy_post(uuid) to authenticated;
grant execute on function public.admin_delete_buddy_comment(uuid) to authenticated;
grant execute on function public.admin_sync_brand_avatar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. 일정 테이블 직접 쓰기 차단 (SELECT 만 공개, 쓰기는 RPC 전용)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.schedules from anon, authenticated;
revoke insert, update, delete on public.buddy_posts from anon, authenticated;
revoke insert, update, delete on public.buddy_comments from anon, authenticated;
grant select, insert on public.buddy_posts to anon, authenticated;
grant select, insert on public.buddy_comments to anon, authenticated;

commit;
