-- ScoutBangers v3 schema
-- Run once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/_/sql/new
-- Paste this whole file, hit Run. Idempotent: safe to re-run.

-- ===== profiles =================================================
-- One row per auth.users row, created automatically on sign-up.
-- Holds display name, avatar, join date — what the Profile tab needs.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  -- When false, the user is hidden from the friends activity feed.
  share_activity boolean not null default true,
  -- Set when the user finishes (or skips) the interactive tour. Null
  -- means "never seen the tour" — used to auto-start it on first
  -- login. Replaying is always allowed via the Profile menu.
  tour_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== playlists ================================================
-- Favorites are stored as a per-user playlist named "Favorites" rather
-- than in a separate table — see useFavorites in the web app.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- Public playlists show on the owner's /u/:userId profile page.
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_songs (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  song_id text not null,
  position integer not null,
  added_at timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

create index if not exists playlist_songs_position_idx
  on public.playlist_songs(playlist_id, position);

-- One "Favorites" playlist per user. Partial index so other playlist
-- names can still have duplicates if a user wants two playlists named
-- the same thing.
create unique index if not exists playlists_one_favorites_per_user
  on public.playlists (user_id)
  where name = 'Favorites';

-- ===== plays ====================================================
-- One row per "play" event, logged when a song crosses 30 s of elapsed
-- playback (Spotify's rule). Anonymous plays are stored with user_id NULL
-- so they still contribute to the global top-10.

create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  song_id text not null,
  artist text,
  played_at timestamptz not null default now()
);

create index if not exists plays_song_idx on public.plays(song_id);
create index if not exists plays_user_idx on public.plays(user_id);
create index if not exists plays_played_at_idx on public.plays(played_at);
create index if not exists plays_artist_idx
  on public.plays(artist) where artist is not null;
-- Composite index supports the rate-limit check on insert.
create index if not exists plays_user_song_played_idx
  on public.plays (user_id, song_id, played_at desc)
  where user_id is not null;

-- ===== row-level security ========================================
alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;
alter table public.plays enable row level security;

-- profiles: anyone can read (so shared profile pages work later); only owner writes
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- playlists: only owner (sharing later)
drop policy if exists "playlists_read_own" on public.playlists;
create policy "playlists_read_own" on public.playlists
  for select using (auth.uid() = user_id);

drop policy if exists "playlists_read_public" on public.playlists;
create policy "playlists_read_public" on public.playlists
  for select using (is_public = true);

drop policy if exists "playlists_insert_own" on public.playlists;
create policy "playlists_insert_own" on public.playlists
  for insert with check (auth.uid() = user_id);

drop policy if exists "playlists_update_own" on public.playlists;
create policy "playlists_update_own" on public.playlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "playlists_delete_own" on public.playlists;
create policy "playlists_delete_own" on public.playlists
  for delete using (auth.uid() = user_id);

drop policy if exists "playlist_songs_read_own" on public.playlist_songs;
create policy "playlist_songs_read_own" on public.playlist_songs
  for select using (
    exists (
      select 1 from public.playlists
      where id = playlist_id and user_id = auth.uid()
    )
  );

drop policy if exists "playlist_songs_read_public" on public.playlist_songs;
create policy "playlist_songs_read_public" on public.playlist_songs
  for select using (
    exists (
      select 1 from public.playlists
      where id = playlist_id and is_public = true
    )
  );

drop policy if exists "playlist_songs_insert_own" on public.playlist_songs;
create policy "playlist_songs_insert_own" on public.playlist_songs
  for insert with check (
    exists (
      select 1 from public.playlists
      where id = playlist_id and user_id = auth.uid()
    )
  );

drop policy if exists "playlist_songs_update_own" on public.playlist_songs;
create policy "playlist_songs_update_own" on public.playlist_songs
  for update
  using (
    exists (
      select 1 from public.playlists
      where id = playlist_id and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists
      where id = playlist_id and user_id = auth.uid()
    )
  );

drop policy if exists "playlist_songs_delete_own" on public.playlist_songs;
create policy "playlist_songs_delete_own" on public.playlist_songs
  for delete using (
    exists (
      select 1 from public.playlists
      where id = playlist_id and user_id = auth.uid()
    )
  );

-- plays: anyone may insert (anonymous + authed); authenticated inserts
-- are rate-limited to 1 per (user, song) per minute so signed-in users
-- can't spam the global top-10. Users may read their own rows.
drop policy if exists "plays_insert_self_or_anon" on public.plays;
create policy "plays_insert_self_or_anon" on public.plays
  for insert
  with check (
    user_id is null
    or (
      auth.uid() = user_id
      and not exists (
        select 1 from public.plays existing
        where existing.user_id = plays.user_id
          and existing.song_id = plays.song_id
          and existing.played_at > now() - interval '60 seconds'
      )
    )
  );

drop policy if exists "plays_read_own" on public.plays;
create policy "plays_read_own" on public.plays
  for select using (auth.uid() = user_id);

-- ===== aggregations ==============================================
-- Exposed as SECURITY DEFINER functions so the aggregation can read
-- across all users without exposing raw play rows to clients.

create or replace function public.top_songs_global(lim int default 10)
returns table(song_id text, play_count bigint)
language sql
security definer
set search_path = public
as $$
  select song_id, count(*)::bigint as play_count
  from public.plays
  group by song_id
  order by play_count desc
  limit lim;
$$;

-- Per-user listening stats. Honors the `share_activity` opt-out:
-- if the target user has `share_activity = false`, returns nothing
-- to anyone but the user themselves.
create or replace function public.top_songs_for_user(uid uuid, lim int default 5)
returns table(song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select song_id, count(*)::bigint as play_count
  from public.plays
  where user_id = uid
    and (
      auth.uid() = uid
      or exists (
        select 1 from public.profiles pr
        where pr.id = uid and pr.share_activity = true
      )
    )
  group by song_id
  order by play_count desc
  limit lim;
$$;

create or replace function public.top_artists_for_user(uid uuid, lim int default 5)
returns table(artist text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select artist, count(*)::bigint as play_count
  from public.plays
  where user_id = uid
    and artist is not null
    and (
      auth.uid() = uid
      or exists (
        select 1 from public.profiles pr
        where pr.id = uid and pr.share_activity = true
      )
    )
  group by artist
  order by play_count desc
  limit lim;
$$;

create or replace function public.recent_plays(lim int default 50)
returns table (
  song_id text,
  user_id uuid,
  display_name text,
  avatar_url text,
  played_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  -- One row per user (their most recent play), excluding the caller.
  -- IS DISTINCT FROM auth.uid() works for anon callers too (auth.uid()
  -- is null, so every non-null user_id is "distinct" and stays in).
  select song_id, user_id, display_name, avatar_url, played_at
  from (
    select distinct on (p.user_id)
      p.song_id,
      p.user_id,
      prof.display_name,
      prof.avatar_url,
      p.played_at
    from public.plays p
    join public.profiles prof on prof.id = p.user_id
    where p.user_id is not null
      and prof.share_activity = true
      and p.user_id is distinct from auth.uid()
    order by p.user_id, p.played_at desc
  ) per_user
  order by played_at desc
  limit lim;
$$;

grant execute on function public.top_songs_global(int) to anon, authenticated;
grant execute on function public.top_songs_for_user(uuid, int) to anon, authenticated;
grant execute on function public.top_artists_for_user(uuid, int) to anon, authenticated;
grant execute on function public.recent_plays(int) to anon, authenticated;

-- ===== playlist_saves =========================================
-- See migrations/0008_playlist_saves.sql for context.

create table if not exists public.playlist_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, playlist_id)
);

create index if not exists playlist_saves_playlist_id_idx
  on public.playlist_saves (playlist_id);
create index if not exists playlist_saves_user_id_saved_at_idx
  on public.playlist_saves (user_id, saved_at desc);

alter table public.playlist_saves enable row level security;

drop policy if exists "playlist_saves readable by anyone" on public.playlist_saves;
drop policy if exists "playlist_saves visible only to the saver" on public.playlist_saves;
create policy "playlist_saves visible only to the saver"
  on public.playlist_saves
  for select
  using (auth.uid() = user_id);

drop policy if exists "users save public playlists" on public.playlist_saves;
create policy "users save public playlists"
  on public.playlist_saves
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.playlists p
      where p.id = playlist_id
        and p.is_public = true
        and p.user_id <> auth.uid()
    )
  );

drop policy if exists "users unsave their own saves" on public.playlist_saves;
create policy "users unsave their own saves"
  on public.playlist_saves
  for delete
  using (auth.uid() = user_id);

create or replace function public.playlist_save_count(pid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.playlist_saves
  where playlist_id = pid;
$$;

grant execute on function public.playlist_save_count(uuid) to anon, authenticated;

create or replace function public.saved_playlists_for_user(uid uuid)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.user_id as owner_id,
    coalesce(prof.display_name, '') as owner_display_name,
    coalesce((select count(*) from public.playlist_songs ps where ps.playlist_id = p.id), 0)::int as song_count,
    s.saved_at
  from public.playlist_saves s
  join public.playlists p on p.id = s.playlist_id
  left join public.profiles prof on prof.id = p.user_id
  where s.user_id = uid
    and p.is_public = true
  order by s.saved_at desc;
$$;

grant execute on function public.saved_playlists_for_user(uuid) to anon, authenticated;
