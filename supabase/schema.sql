create extension if not exists pgcrypto;

create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '나의 시간표' check (char_length(name) between 1 and 60),
  share_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  sharing_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.timetable_members (
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (timetable_id, user_id)
);

create table if not exists public.schedules (
  id uuid primary key,
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  start_time text not null,
  end_time text not null,
  title text not null check (char_length(title) between 1 and 60),
  color text not null default '#4d79e8',
  note text not null default '',
  periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.timetables enable row level security;
alter table public.timetable_members enable row level security;
alter table public.schedules enable row level security;

create or replace function public.is_timetable_owner(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.timetables
    where id = target_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_view_timetable(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.timetables t
    where t.id = target_id
      and (
        t.owner_id = (select auth.uid())
        or exists (
          select 1 from public.timetable_members m
          where m.timetable_id = t.id and m.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_edit_timetable(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.timetables t
    where t.id = target_id
      and (
        t.owner_id = (select auth.uid())
        or exists (
          select 1 from public.timetable_members m
          where m.timetable_id = t.id
            and m.user_id = (select auth.uid())
            and m.role = 'editor'
        )
      )
  );
$$;

drop policy if exists "view accessible timetables" on public.timetables;
create policy "view accessible timetables" on public.timetables for select to authenticated
using (public.can_view_timetable(id));
drop policy if exists "create own timetables" on public.timetables;
create policy "create own timetables" on public.timetables for insert to authenticated
with check ((select auth.uid()) = owner_id);
drop policy if exists "update own timetables" on public.timetables;
create policy "update own timetables" on public.timetables for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "delete own timetables" on public.timetables;
create policy "delete own timetables" on public.timetables for delete to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "view own memberships" on public.timetable_members;
create policy "view own memberships" on public.timetable_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_timetable_owner(timetable_id));
drop policy if exists "owners manage memberships" on public.timetable_members;
create policy "owners manage memberships" on public.timetable_members for update to authenticated
using (public.is_timetable_owner(timetable_id)) with check (public.is_timetable_owner(timetable_id));
drop policy if exists "leave or remove memberships" on public.timetable_members;
create policy "leave or remove memberships" on public.timetable_members for delete to authenticated
using (user_id = (select auth.uid()) or public.is_timetable_owner(timetable_id));

drop policy if exists "view accessible schedules" on public.schedules;
create policy "view accessible schedules" on public.schedules for select to authenticated
using (public.can_view_timetable(timetable_id));
drop policy if exists "create editable schedules" on public.schedules;
create policy "create editable schedules" on public.schedules for insert to authenticated
with check (public.can_edit_timetable(timetable_id));
drop policy if exists "update editable schedules" on public.schedules;
create policy "update editable schedules" on public.schedules for update to authenticated
using (public.can_edit_timetable(timetable_id)) with check (public.can_edit_timetable(timetable_id));
drop policy if exists "delete editable schedules" on public.schedules;
create policy "delete editable schedules" on public.schedules for delete to authenticated
using (public.can_edit_timetable(timetable_id));

create or replace function public.join_timetable_by_code(input_code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id into target_id from public.timetables
  where share_code = lower(trim(input_code)) and sharing_enabled = true;
  if target_id is null then raise exception '유효하지 않은 공유 코드입니다'; end if;
  if not public.is_timetable_owner(target_id) then
    insert into public.timetable_members(timetable_id, user_id, role)
    values (target_id, auth.uid(), 'viewer')
    on conflict (timetable_id, user_id) do nothing;
  end if;
  return target_id;
end;
$$;

revoke all on table public.timetables, public.timetable_members, public.schedules from anon, authenticated;
grant select, insert, update, delete on table public.timetables, public.timetable_members, public.schedules to authenticated;
revoke all on function public.join_timetable_by_code(text), public.is_timetable_owner(uuid), public.can_view_timetable(uuid), public.can_edit_timetable(uuid) from public;
grant execute on function public.join_timetable_by_code(text) to authenticated;
grant execute on function public.is_timetable_owner(uuid), public.can_view_timetable(uuid), public.can_edit_timetable(uuid) to authenticated;
