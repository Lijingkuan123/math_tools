create extension if not exists pgcrypto;

create table if not exists public.practice_groups (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  name text not null check (char_length(name) between 2 and 40),
  creator_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.practice_groups(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id text not null unique,
  group_id uuid not null references public.practice_groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  user_id uuid not null,
  attempt_type text not null check (attempt_type in ('test', 'review')),
  question_count integer not null check (question_count between 1 and 81),
  correct_count integer not null check (
    correct_count >= 0 and correct_count <= question_count
  ),
  accuracy integer not null check (accuracy between 0 and 100),
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists participants_group_id_idx
  on public.participants(group_id);
create index if not exists attempts_group_completed_idx
  on public.attempts(group_id, completed_at desc);
create index if not exists attempts_participant_completed_idx
  on public.attempts(participant_id, completed_at desc);

alter table public.practice_groups enable row level security;
alter table public.participants enable row level security;
alter table public.attempts enable row level security;

create or replace function public.is_practice_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_practice_group_member(uuid) from public;
grant execute on function public.is_practice_group_member(uuid) to authenticated;

drop policy if exists "members can read practice groups" on public.practice_groups;
create policy "members can read practice groups"
on public.practice_groups for select
to authenticated
using (public.is_practice_group_member(id));

drop policy if exists "members can read participants" on public.participants;
create policy "members can read participants"
on public.participants for select
to authenticated
using (public.is_practice_group_member(group_id));

drop policy if exists "members can read attempts" on public.attempts;
create policy "members can read attempts"
on public.attempts for select
to authenticated
using (public.is_practice_group_member(group_id));

drop policy if exists "users can insert own attempts" on public.attempts;
create policy "users can insert own attempts"
on public.attempts for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.participants
    where participants.id = participant_id
      and participants.group_id = attempts.group_id
      and participants.user_id = auth.uid()
  )
);

create or replace function public.create_practice_group(
  p_name text,
  p_nickname text
)
returns table (
  group_id uuid,
  group_name text,
  invite_code text,
  participant_id uuid,
  nickname text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_participant_id uuid;
  v_invite_code text;
  v_group_name text := trim(p_name);
  v_nickname text := trim(p_nickname);
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(v_group_name) not between 2 and 40 then
    raise exception 'Group name must contain 2 to 40 characters';
  end if;
  if char_length(v_nickname) not between 2 and 20 then
    raise exception 'Nickname must contain 2 to 20 characters';
  end if;

  for v_attempt in 1..5 loop
    v_invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.practice_groups (invite_code, name, creator_user_id)
      values (v_invite_code, v_group_name, v_user_id)
      returning id into v_group_id;
      exit;
    exception when unique_violation then
      v_group_id := null;
    end;
  end loop;

  if v_group_id is null then
    raise exception 'Could not create a unique invite code';
  end if;

  insert into public.participants (group_id, user_id, nickname)
  values (v_group_id, v_user_id, v_nickname)
  returning id into v_participant_id;

  return query select
    v_group_id,
    v_group_name,
    v_invite_code,
    v_participant_id,
    v_nickname;
end;
$$;

create or replace function public.join_practice_group(
  p_invite_code text,
  p_nickname text
)
returns table (
  group_id uuid,
  group_name text,
  invite_code text,
  participant_id uuid,
  nickname text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_group_name text;
  v_invite_code text := upper(trim(p_invite_code));
  v_participant_id uuid;
  v_nickname text := trim(p_nickname);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(v_nickname) not between 2 and 20 then
    raise exception 'Nickname must contain 2 to 20 characters';
  end if;

  select practice_groups.id, practice_groups.name
  into v_group_id, v_group_name
  from public.practice_groups
  where practice_groups.invite_code = v_invite_code;

  if v_group_id is null then
    raise exception 'Practice group not found';
  end if;

  insert into public.participants (group_id, user_id, nickname)
  values (v_group_id, v_user_id, v_nickname)
  on conflict (group_id, user_id)
  do update set nickname = excluded.nickname
  returning id into v_participant_id;

  return query select
    v_group_id,
    v_group_name,
    v_invite_code,
    v_participant_id,
    v_nickname;
end;
$$;

revoke all on function public.create_practice_group(text, text) from public;
revoke all on function public.join_practice_group(text, text) from public;
grant execute on function public.create_practice_group(text, text) to authenticated;
grant execute on function public.join_practice_group(text, text) to authenticated;

grant select on public.practice_groups to authenticated;
grant select on public.participants to authenticated;
grant select, insert on public.attempts to authenticated;
