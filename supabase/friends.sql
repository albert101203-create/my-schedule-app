create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '사용자' check (char_length(display_name) between 1 and 30),
  friend_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (sender_id, receiver_id),
  check (sender_id <> receiver_id)
);

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), '사용자'), 30))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

insert into public.profiles(id, display_name)
select id, left(coalesce(nullif(split_part(email, '@', 1), ''), '사용자'), 30)
from auth.users
on conflict (id) do nothing;

create or replace function public.get_my_profile()
returns table(display_name text, friend_code text)
language sql stable security definer
set search_path = ''
as $$
  select p.display_name, p.friend_code
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.update_my_display_name(input_name text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if char_length(trim(input_name)) < 1 or char_length(trim(input_name)) > 30 then
    raise exception '이름은 1자 이상 30자 이하로 입력하세요';
  end if;
  update public.profiles set display_name = trim(input_name)
  where id = auth.uid();
end;
$$;

create or replace function public.send_friend_request(input_code text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare target_user uuid; reverse_request uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id into target_user from public.profiles
  where friend_code = upper(trim(input_code));
  if target_user is null then raise exception '친구 코드를 찾을 수 없습니다'; end if;
  if target_user = auth.uid() then raise exception '내 코드는 추가할 수 없습니다'; end if;
  if exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((sender_id = auth.uid() and receiver_id = target_user)
        or (sender_id = target_user and receiver_id = auth.uid()))
  ) then raise exception '이미 친구입니다'; end if;
  select id into reverse_request from public.friend_requests
  where sender_id = target_user and receiver_id = auth.uid() and status = 'pending';
  if reverse_request is not null then
    update public.friend_requests set status = 'accepted' where id = reverse_request;
    return 'accepted';
  end if;
  insert into public.friend_requests(sender_id, receiver_id)
  values (auth.uid(), target_user)
  on conflict (sender_id, receiver_id) do update set status = 'pending';
  return 'pending';
end;
$$;

create or replace function public.get_pending_friend_requests()
returns table(request_id uuid, sender_id uuid, display_name text, friend_code text)
language sql stable security definer
set search_path = ''
as $$
  select r.id, p.id, p.display_name, p.friend_code
  from public.friend_requests r
  join public.profiles p on p.id = r.sender_id
  where r.receiver_id = (select auth.uid()) and r.status = 'pending'
  order by r.created_at;
$$;

create or replace function public.respond_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if accept_request then
    update public.friend_requests set status = 'accepted'
    where id = request_id and receiver_id = auth.uid() and status = 'pending';
  else
    delete from public.friend_requests
    where id = request_id and receiver_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

create or replace function public.get_friends()
returns table(friend_id uuid, display_name text, friend_code text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.friend_code
  from public.friend_requests r
  join public.profiles p
    on p.id = case when r.sender_id = (select auth.uid()) then r.receiver_id else r.sender_id end
  where r.status = 'accepted'
    and ((r.sender_id = (select auth.uid())) or (r.receiver_id = (select auth.uid())))
  order by p.display_name;
$$;

create or replace function public.remove_friend(target_friend uuid)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.friend_requests
  where status = 'accepted'
    and ((sender_id = (select auth.uid()) and receiver_id = target_friend)
      or (sender_id = target_friend and receiver_id = (select auth.uid())));
$$;

create or replace function public.share_timetable_with_friend(target_timetable uuid, target_friend uuid, access_role text default 'viewer')
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if access_role not in ('viewer', 'editor') then raise exception '잘못된 공유 권한입니다'; end if;
  if not public.is_timetable_owner(target_timetable) then raise exception '내 시간표만 공유할 수 있습니다'; end if;
  if not exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((sender_id = auth.uid() and receiver_id = target_friend)
        or (sender_id = target_friend and receiver_id = auth.uid()))
  ) then raise exception '친구에게만 공유할 수 있습니다'; end if;
  insert into public.timetable_members(timetable_id, user_id, role)
  values (target_timetable, target_friend, access_role)
  on conflict (timetable_id, user_id) do update set role = excluded.role;
end;
$$;

revoke all on table public.profiles, public.friend_requests from anon, authenticated;
revoke all on function public.get_my_profile(), public.update_my_display_name(text), public.send_friend_request(text), public.get_pending_friend_requests(), public.respond_friend_request(uuid, boolean), public.get_friends(), public.remove_friend(uuid), public.share_timetable_with_friend(uuid, uuid, text) from public;
grant execute on function public.get_my_profile(), public.update_my_display_name(text), public.send_friend_request(text), public.get_pending_friend_requests(), public.respond_friend_request(uuid, boolean), public.get_friends(), public.remove_friend(uuid), public.share_timetable_with_friend(uuid, uuid, text) to authenticated;
