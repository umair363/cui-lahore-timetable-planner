-- ============================================================================
-- CUI Lahore Timetable Planner — swap board schema
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query
-- → paste → Run). It is written to be safe to re-run.
--
-- SECURITY NOTE, READ BEFORE CHANGING ANYTHING
-- The anon key is published in the browser. That is normal and expected for
-- Supabase, but it means Row Level Security is the ONLY thing standing between
-- this data and the whole internet. Every table below enables RLS and every
-- table has explicit policies. A table without RLS is readable and writable by
-- anyone who opens devtools. Never add a table here without enabling it.
-- ============================================================================

-- Only real students should be able to post or chat. Change this one line if
-- the student mail domain is different, then re-run.
create or replace function public.is_university_member()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@cuilahore.edu.pk'
$$;

-- ---------------------------------------------------------------- profiles
-- A handle, not a real name. The board shows this; it never shows the email,
-- and nothing here stores a legal name or phone number.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  handle      text not null check (char_length(handle) between 2 and 24),
  section     text check (char_length(section) <= 40),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_handle_key on public.profiles (lower(handle));

alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and public.is_university_member());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- blocks
-- Declared before the tables whose policies consult it.
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  )
$$;

-- ---------------------------------------------------------------- requests
-- offering ids are the app's stable "COURSE::SECTION_NAME::GROUP" form, never
-- the timetable's positional numeric ids (those shift on every scrape).
create table if not exists public.swap_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  course      text not null check (char_length(course) between 2 and 16),
  have        text not null check (char_length(have) <= 120),
  want        text[] not null check (cardinality(want) between 1 and 40),
  plan        text[] not null default '{}' check (cardinality(plan) <= 40),
  note        text check (char_length(note) <= 280),
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now()
);
create index if not exists swap_requests_course_idx on public.swap_requests (course) where status = 'open';
create index if not exists swap_requests_user_idx on public.swap_requests (user_id);

-- One open request per course per person: posting five variations of the same
-- ask is how a board turns into noise.
create unique index if not exists swap_requests_one_open_per_course
  on public.swap_requests (user_id, course) where status = 'open';

alter table public.swap_requests enable row level security;

drop policy if exists swap_requests_read on public.swap_requests;
create policy swap_requests_read on public.swap_requests
  for select to authenticated
  using (status = 'open' or user_id = auth.uid());

drop policy if exists swap_requests_insert_own on public.swap_requests;
create policy swap_requests_insert_own on public.swap_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_university_member()
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

drop policy if exists swap_requests_modify_own on public.swap_requests;
create policy swap_requests_modify_own on public.swap_requests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists swap_requests_delete_own on public.swap_requests;
create policy swap_requests_delete_own on public.swap_requests
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- threads
-- A conversation always hangs off a specific swap request. There is no way to
-- open a DM with someone just because you saw them on the board - you can only
-- talk to somebody about a swap they actually posted. That is deliberate.
create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.swap_requests on delete cascade,
  owner_id     uuid not null references auth.users on delete cascade,  -- posted the request
  initiator_id uuid not null references auth.users on delete cascade,  -- started the conversation
  created_at   timestamptz not null default now(),
  constraint threads_distinct_parties check (owner_id <> initiator_id)
);
create unique index if not exists threads_one_per_pair on public.threads (request_id, initiator_id);
create index if not exists threads_owner_idx on public.threads (owner_id);
create index if not exists threads_initiator_idx on public.threads (initiator_id);

alter table public.threads enable row level security;

drop policy if exists threads_read_participants on public.threads;
create policy threads_read_participants on public.threads
  for select to authenticated
  using (owner_id = auth.uid() or initiator_id = auth.uid());

drop policy if exists threads_open_as_initiator on public.threads;
create policy threads_open_as_initiator on public.threads
  for insert to authenticated
  with check (
    initiator_id = auth.uid()
    and public.is_university_member()
    and not public.blocked_between(auth.uid(), owner_id)
    and exists (
      select 1 from public.swap_requests r
      where r.id = request_id and r.user_id = owner_id and r.status = 'open'
    )
  );

-- ---------------------------------------------------------------- messages
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads on delete cascade,
  sender_id  uuid not null references auth.users on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);

alter table public.messages enable row level security;

drop policy if exists messages_read_participants on public.messages;
create policy messages_read_participants on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.threads t
    where t.id = thread_id and (t.owner_id = auth.uid() or t.initiator_id = auth.uid())
  ));

drop policy if exists messages_send_participants on public.messages;
create policy messages_send_participants on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.threads t
      where t.id = thread_id
        and (t.owner_id = auth.uid() or t.initiator_id = auth.uid())
        and not public.blocked_between(t.owner_id, t.initiator_id)
    )
  );

-- Senders may retract their own messages; nobody can edit them after the fact.
drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- ---------------------------------------------------------------- reports
-- Write-only for users: you can file one, you cannot read anyone else's.
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade,
  subject_id  uuid references auth.users on delete set null,
  thread_id   uuid references public.threads on delete set null,
  reason      text not null check (char_length(reason) between 3 and 500),
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;

drop policy if exists reports_file on public.reports;
create policy reports_file on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());

-- ---------------------------------------------------------------- realtime
-- Realtime respects RLS, so subscribers still only receive rows they are
-- allowed to read.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'swap_requests'
  ) then
    alter publication supabase_realtime add table public.swap_requests;
  end if;
end $$;

-- ---------------------------------------------------------------- check
-- Every table in public must have RLS on. If this raises, do not ship.
do $$
declare unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if unprotected is not null then
    raise exception 'Tables without row level security: %', unprotected;
  end if;
end $$;
