-- ========================================
-- Darkest-Like Lobby System Schema
-- ========================================
-- Run this SQL in your Supabase SQL Editor
-- Safe to re-run (idempotent)

-- ========================================
-- TABLES
-- ========================================

-- Lobbies table
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,        -- short join code (5 chars)
  created_by uuid not null,
  created_at timestamptz not null default now(),
  started_at timestamptz            -- null until game starts
);

-- Lobby members table
create table if not exists public.lobby_members (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  is_host boolean not null default false,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

-- ========================================
-- INDEXES (for performance)
-- ========================================

create index if not exists idx_lobbies_code on public.lobbies(code);
create index if not exists idx_lobby_members_lobby_id on public.lobby_members(lobby_id);
create index if not exists idx_lobby_members_user_id on public.lobby_members(user_id);

-- ========================================
-- REALTIME PUBLICATION
-- ========================================

-- Enable realtime for both tables
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.lobby_members;

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS
alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;

-- ========================================
-- CAPACITY GUARD FUNCTION
-- ========================================

-- Function to check if lobby has capacity (max 3 members)
create or replace function public.lobby_has_capacity(l_id uuid)
returns boolean 
language sql 
stable 
as $$
  select (select count(*) from public.lobby_members m where m.lobby_id = l_id) < 3
$$;

-- ========================================
-- RLS POLICIES - LOBBIES TABLE
-- ========================================

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "lobbies.insert by creator" on public.lobbies;
drop policy if exists "lobbies.select for members" on public.lobbies;
drop policy if exists "lobbies.update by host" on public.lobbies;

-- Create lobby: only authenticated users can create
create policy "lobbies.insert by creator" on public.lobbies
  for insert 
  with check (auth.uid() = created_by);

-- Read lobbies: members can select their lobby
create policy "lobbies.select for members" on public.lobbies
  for select 
  using (
    exists (
      select 1 from public.lobby_members m
      where m.lobby_id = lobbies.id and m.user_id = auth.uid()
    )
  );

-- Update lobby: host can update (for starting game)
create policy "lobbies.update by host" on public.lobbies
  for update
  using (
    exists (
      select 1 from public.lobby_members m
      where m.lobby_id = lobbies.id 
        and m.user_id = auth.uid() 
        and m.is_host = true
    )
  );

-- ========================================
-- RLS POLICIES - LOBBY_MEMBERS TABLE
-- ========================================

-- Drop existing policies if they exist (for idempotency)
drop policy if exists "members.insert self if capacity" on public.lobby_members;
drop policy if exists "members.select in my lobby" on public.lobby_members;
drop policy if exists "members.update self" on public.lobby_members;
drop policy if exists "members.delete self" on public.lobby_members;

-- Join lobby: user inserts their own membership only if capacity remains
create policy "members.insert self if capacity" on public.lobby_members
  for insert 
  with check (
    auth.uid() = user_id
    and public.lobby_has_capacity(lobby_id)
  );

-- Read members: a user can read rows from lobbies they are in
create policy "members.select in my lobby" on public.lobby_members
  for select 
  using (
    exists (
      select 1 from public.lobby_members me
      where me.lobby_id = lobby_members.lobby_id 
        and me.user_id = auth.uid()
    )
  );

-- Update self (ready state, name)
create policy "members.update self" on public.lobby_members
  for update 
  using (auth.uid() = user_id);

-- Leave lobby: user can delete their own membership
create policy "members.delete self" on public.lobby_members
  for delete
  using (auth.uid() = user_id);

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to clean up empty lobbies (optional, for maintenance)
create or replace function public.cleanup_empty_lobbies()
returns void
language sql
as $$
  delete from public.lobbies
  where id not in (select distinct lobby_id from public.lobby_members)
    and created_at < now() - interval '1 hour';
$$;

-- ========================================
-- GRANTS (ensure anon can access)
-- ========================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.lobbies to anon, authenticated;
grant select, insert, update, delete on public.lobby_members to anon, authenticated;

-- ========================================
-- VERIFICATION
-- ========================================

-- Verify tables exist
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lobbies') then
    raise exception 'Table public.lobbies was not created';
  end if;
  
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lobby_members') then
    raise exception 'Table public.lobby_members was not created';
  end if;
  
  raise notice 'Schema setup complete! Tables created successfully.';
end;
$$;






