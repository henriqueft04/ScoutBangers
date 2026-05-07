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

-- ===== favorites ================================================
create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- ===== playlists ================================================
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
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
alter table public.favorites enable row level security;
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

-- favorites: only owner
drop policy if exists "favorites_read_own" on public.favorites;
create policy "favorites_read_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- playlists: only owner (sharing later)
drop policy if exists "playlists_read_own" on public.playlists;
create policy "playlists_read_own" on public.playlists
  for select using (auth.uid() = user_id);

drop policy if exists "playlists_insert_own" on public.playlists;
create policy "playlists_insert_own" on public.playlists
  for insert with check (auth.uid() = user_id);

drop policy if exists "playlists_update_own" on public.playlists;
create policy "playlists_update_own" on public.playlists
  for update using (auth.uid() = user_id);

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
  for update using (
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

create or replace function public.top_songs_for_user(uid uuid, lim int default 5)
returns table(song_id text, play_count bigint)
language sql
security definer
set search_path = public
as $$
  select song_id, count(*)::bigint as play_count
  from public.plays
  where user_id = uid
  group by song_id
  order by play_count desc
  limit lim;
$$;

create or replace function public.top_artists_for_user(uid uuid, lim int default 5)
returns table(artist text, play_count bigint)
language sql
security definer
set search_path = public
as $$
  select artist, count(*)::bigint as play_count
  from public.plays
  where user_id = uid and artist is not null
  group by artist
  order by play_count desc
  limit lim;
$$;

grant execute on function public.top_songs_global(int) to anon, authenticated;
grant execute on function public.top_songs_for_user(uuid, int) to authenticated;
grant execute on function public.top_artists_for_user(uuid, int) to authenticated;
