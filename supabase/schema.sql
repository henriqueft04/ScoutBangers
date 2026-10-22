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
  is_admin boolean not null default false,
  update_tour_seen boolean default false,
  jam_tour_seen boolean default false,
  playlists_tour_seen boolean default false,
  artists_tour_seen boolean default false,
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

-- ===== song_submissions ========================================

create table if not exists public.song_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', -- 'pending', 'approved', 'rejected'
  title text not null,
  artist text not null,
  album text,
  year text,
  genre text,
  audio_path text not null,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

alter table public.song_submissions enable row level security;

-- Users can read their own submissions
drop policy if exists "users_read_own_submissions" on public.song_submissions;
create policy "users_read_own_submissions" on public.song_submissions
  for select using (auth.uid() = user_id);

-- Users can insert their own submissions
drop policy if exists "users_insert_own_submissions" on public.song_submissions;
create policy "users_insert_own_submissions" on public.song_submissions
  for insert with check (auth.uid() = user_id and status = 'pending');

-- Admins can read all submissions
drop policy if exists "admins_read_all_submissions" on public.song_submissions;
create policy "admins_read_all_submissions" on public.song_submissions
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Admins can update all submissions
drop policy if exists "admins_update_all_submissions" on public.song_submissions;
create policy "admins_update_all_submissions" on public.song_submissions
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Insert submissions bucket
insert into storage.buckets (id, name, public) 
values ('submissions', 'submissions', false)
on conflict do nothing;

drop policy if exists "Users can upload submissions" on storage.objects;
create policy "Users can upload submissions" on storage.objects
  for insert with check (bucket_id = 'submissions' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Admins can read submissions" on storage.objects;
create policy "Admins can read submissions" on storage.objects
  for select using (bucket_id = 'submissions' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Admins can delete submissions" on storage.objects;
create policy "Admins can delete submissions" on storage.objects
  for delete using (bucket_id = 'submissions' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Protect is_admin from being updated by regular users
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Only allow the service_role (or superuser) to change this flag
    IF current_setting('role') != 'service_role' THEN
      NEW.is_admin = OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_is_admin_trigger ON public.profiles;
CREATE TRIGGER protect_is_admin_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_is_admin();

-- 0030_playlist_discovery

create or replace function public.my_playlists_overview(uid uuid)
returns table (
  id uuid,
  name text,
  is_public boolean,
  created_at timestamptz,
  song_count int,
  save_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_public,
    p.created_at,
    (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
    (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count
  from public.playlists p
  where p.user_id = uid
    and uid = auth.uid()
  order by p.created_at desc;
$$;

grant execute on function public.my_playlists_overview(uuid) to authenticated;

-- sort: 'saves' (most saved first) or 'recent'.
create or replace function public.discover_public_playlists(
  q text default '',
  sort text default 'saves',
  lim int default 20,
  off int default 0
)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  save_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.owner_id, d.owner_display_name, d.song_count, d.save_count
  from (
    select
      p.id,
      p.name,
      p.user_id as owner_id,
      coalesce(prof.display_name, '') as owner_display_name,
      (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
      (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count,
      p.created_at
    from public.playlists p
    left join public.profiles prof on prof.id = p.user_id
    where p.is_public = true
      and p.name <> 'Favorites'
      and p.user_id is distinct from auth.uid()
      and (
        coalesce(q, '') = ''
        or p.name ilike '%' || q || '%'
        or coalesce(prof.display_name, '') ilike '%' || q || '%'
      )
  ) d
  where d.song_count > 0
  order by
    case when sort = 'recent' then null else d.save_count end desc nulls last,
    d.created_at desc
  limit least(greatest(lim, 1), 50)
  offset greatest(off, 0);
$$;

grant execute on function public.discover_public_playlists(text, text, int, int) to anon, authenticated;

-- Save counts on the playlists a user has saved.
drop function if exists public.saved_playlists_for_user(uuid);
create function public.saved_playlists_for_user(uid uuid)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  saved_at timestamptz,
  save_count int
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
    s.saved_at,
    (select count(*) from public.playlist_saves s2 where s2.playlist_id = p.id)::int as save_count
  from public.playlist_saves s
  join public.playlists p on p.id = s.playlist_id
  left join public.profiles prof on prof.id = p.user_id
  where s.user_id = uid
    and p.is_public = true
  order by s.saved_at desc;
$$;

grant execute on function public.saved_playlists_for_user(uuid) to anon, authenticated;

-- 0031_playlist_cover
alter table public.playlists add column if not exists cover_url text;

-- 0032_playlist_row_covers
-- Playlist lists show a thumbnail: the custom cover when set, otherwise
-- built from the first few songs. The three list RPCs now also return
-- `cover_url` and `preview_song_ids` (first 4 song ids by position).

drop function if exists public.my_playlists_overview(uuid);
create function public.my_playlists_overview(uid uuid)
returns table (
  id uuid,
  name text,
  is_public boolean,
  created_at timestamptz,
  song_count int,
  save_count int,
  cover_url text,
  preview_song_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_public,
    p.created_at,
    (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
    (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count,
    p.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = p.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids
  from public.playlists p
  where p.user_id = uid
    and uid = auth.uid()
  order by p.created_at desc;
$$;

grant execute on function public.my_playlists_overview(uuid) to authenticated;

drop function if exists public.discover_public_playlists(text, text, int, int);
create function public.discover_public_playlists(
  q text default '',
  sort text default 'saves',
  lim int default 20,
  off int default 0
)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  save_count int,
  cover_url text,
  preview_song_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id, d.name, d.owner_id, d.owner_display_name,
    d.song_count, d.save_count, d.cover_url, d.preview_song_ids
  from (
    select
      p.id,
      p.name,
      p.user_id as owner_id,
      coalesce(prof.display_name, '') as owner_display_name,
      (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
      (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count,
      p.cover_url,
      coalesce((
        select array_agg(x.song_id order by x.position)
        from (
          select ps.song_id, ps.position
          from public.playlist_songs ps
          where ps.playlist_id = p.id
          order by ps.position
          limit 16
        ) x
      ), '{}'::text[]) as preview_song_ids,
      p.created_at
    from public.playlists p
    left join public.profiles prof on prof.id = p.user_id
    where p.is_public = true
      and p.name <> 'Favorites'
      and p.user_id is distinct from auth.uid()
      and (
        coalesce(q, '') = ''
        or p.name ilike '%' || q || '%'
        or coalesce(prof.display_name, '') ilike '%' || q || '%'
      )
  ) d
  where d.song_count > 0
  order by
    case when sort = 'recent' then null else d.save_count end desc nulls last,
    d.created_at desc
  limit least(greatest(lim, 1), 50)
  offset greatest(off, 0);
$$;

grant execute on function public.discover_public_playlists(text, text, int, int) to anon, authenticated;

drop function if exists public.saved_playlists_for_user(uuid);
create function public.saved_playlists_for_user(uid uuid)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  saved_at timestamptz,
  save_count int,
  cover_url text,
  preview_song_ids text[]
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
    s.saved_at,
    (select count(*) from public.playlist_saves s2 where s2.playlist_id = p.id)::int as save_count,
    p.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = p.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids
  from public.playlist_saves s
  join public.playlists p on p.id = s.playlist_id
  left join public.profiles prof on prof.id = p.user_id
  where s.user_id = uid
    and p.is_public = true
  order by s.saved_at desc;
$$;

grant execute on function public.saved_playlists_for_user(uuid) to anon, authenticated;

-- ===== discover_public_playlists: paginate first (0034) ===========

drop function if exists public.discover_public_playlists(text, text, int, int);
create function public.discover_public_playlists(
  q text default '',
  sort text default 'saves',
  lim int default 20,
  off int default 0
)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  save_count int,
  cover_url text,
  preview_song_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      p.id,
      p.name,
      p.user_id,
      p.cover_url,
      p.created_at,
      coalesce(prof.display_name, '') as owner_display_name,
      case
        when sort = 'recent' then 0
        else (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int
      end as sort_saves
    from public.playlists p
    left join public.profiles prof on prof.id = p.user_id
    where p.is_public = true
      and p.name <> 'Favorites'
      and p.user_id is distinct from auth.uid()
      and exists (select 1 from public.playlist_songs ps where ps.playlist_id = p.id)
      and (
        coalesce(q, '') = ''
        or p.name ilike '%' || q || '%'
        or coalesce(prof.display_name, '') ilike '%' || q || '%'
      )
    order by sort_saves desc, p.created_at desc
    limit least(greatest(lim, 1), 50)
    offset greatest(off, 0)
  )
  select
    c.id,
    c.name,
    c.user_id as owner_id,
    c.owner_display_name,
    (select count(*) from public.playlist_songs ps where ps.playlist_id = c.id)::int as song_count,
    (select count(*) from public.playlist_saves s where s.playlist_id = c.id)::int as save_count,
    c.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = c.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids
  from candidates c
  order by c.sort_saves desc, c.created_at desc;
$$;

grant execute on function public.discover_public_playlists(text, text, int, int) to anon, authenticated;


create table if not exists public.playlist_collaborators (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create index if not exists playlist_collaborators_user_idx
  on public.playlist_collaborators (user_id);

alter table public.playlist_collaborators enable row level security;

create or replace function public.is_playlist_owner(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = pid and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_playlist_editor(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = pid
      and (
        p.user_id = auth.uid()
        or exists (
          select 1 from public.playlist_collaborators c
          where c.playlist_id = p.id
            and c.user_id = auth.uid()
            and c.status = 'accepted'
        )
      )
  );
$$;

grant execute on function public.is_playlist_owner(uuid) to authenticated;
grant execute on function public.is_playlist_editor(uuid) to authenticated;

drop policy if exists "collaborators_read" on public.playlist_collaborators;
create policy "collaborators_read" on public.playlist_collaborators
  for select using (
    user_id = auth.uid() or public.is_playlist_owner(playlist_id)
  );

drop policy if exists "collaborators_delete" on public.playlist_collaborators;
create policy "collaborators_delete" on public.playlist_collaborators
  for delete using (
    user_id = auth.uid() or public.is_playlist_owner(playlist_id)
  );

drop policy if exists "playlists_read_collaborator" on public.playlists;
create policy "playlists_read_collaborator" on public.playlists
  for select using (public.is_playlist_editor(id));

drop policy if exists "playlists_update_own" on public.playlists;
drop policy if exists "playlists_update_editor" on public.playlists;
create policy "playlists_update_editor" on public.playlists
  for update
  using (public.is_playlist_editor(id))
  with check (public.is_playlist_editor(id));

create or replace function public.guard_playlist_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'Cannot change the owner of a playlist';
    end if;
    if new.is_public is distinct from old.is_public
       and auth.uid() is distinct from old.user_id then
      raise exception 'Only the owner can change playlist visibility';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_playlist_update on public.playlists;
create trigger guard_playlist_update
  before update on public.playlists
  for each row execute function public.guard_playlist_update();

drop policy if exists "playlist_songs_read_editor" on public.playlist_songs;
create policy "playlist_songs_read_editor" on public.playlist_songs
  for select using (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_insert_own" on public.playlist_songs;
drop policy if exists "playlist_songs_insert_editor" on public.playlist_songs;
create policy "playlist_songs_insert_editor" on public.playlist_songs
  for insert with check (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_update_own" on public.playlist_songs;
drop policy if exists "playlist_songs_update_editor" on public.playlist_songs;
create policy "playlist_songs_update_editor" on public.playlist_songs
  for update
  using (public.is_playlist_editor(playlist_id))
  with check (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_delete_own" on public.playlist_songs;
drop policy if exists "playlist_songs_delete_editor" on public.playlist_songs;
create policy "playlist_songs_delete_editor" on public.playlist_songs
  for delete using (public.is_playlist_editor(playlist_id));

create or replace function public.invite_playlist_collaborator(pid uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_playlist_owner(pid) then
    raise exception 'Only the owner can invite collaborators';
  end if;
  if uid = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;
  if exists (select 1 from public.playlists where id = pid and name = 'Favorites') then
    raise exception 'Favorites cannot have collaborators';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Unknown user';
  end if;
  insert into public.playlist_collaborators (playlist_id, user_id, invited_by)
  values (pid, uid, auth.uid())
  on conflict (playlist_id, user_id) do nothing;
end;
$$;

grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

create or replace function public.playlist_collaborators_list(pid uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id, coalesce(prof.display_name, '') as display_name, prof.avatar_url, c.status
  from public.playlist_collaborators c
  join public.playlists p on p.id = c.playlist_id
  left join public.profiles prof on prof.id = c.user_id
  where c.playlist_id = pid
    and (
      c.status = 'accepted'
      or p.user_id = auth.uid()
      or c.user_id = auth.uid()
    )
    and (
      p.is_public = true
      or public.is_playlist_editor(pid)
      or c.user_id = auth.uid()
    )
  order by c.created_at;
$$;

grant execute on function public.playlist_collaborators_list(uuid) to anon, authenticated;

create or replace function public.my_playlist_invites()
returns table (
  playlist_id uuid,
  playlist_name text,
  inviter_id uuid,
  inviter_name text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.playlist_id,
    p.name as playlist_name,
    c.invited_by as inviter_id,
    coalesce(prof.display_name, '') as inviter_name,
    c.created_at as invited_at
  from public.playlist_collaborators c
  join public.playlists p on p.id = c.playlist_id
  left join public.profiles prof on prof.id = c.invited_by
  where c.user_id = auth.uid()
    and c.status = 'pending'
  order by c.created_at desc;
$$;

grant execute on function public.my_playlist_invites() to authenticated;

create or replace function public.respond_playlist_invite(pid uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if accept then
    update public.playlist_collaborators
    set status = 'accepted'
    where playlist_id = pid and user_id = auth.uid() and status = 'pending';
  else
    delete from public.playlist_collaborators
    where playlist_id = pid and user_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

grant execute on function public.respond_playlist_invite(uuid, boolean) to authenticated;

drop function if exists public.my_playlists_overview(uuid);
create function public.my_playlists_overview(uid uuid)
returns table (
  id uuid,
  name text,
  is_public boolean,
  created_at timestamptz,
  song_count int,
  save_count int,
  cover_url text,
  preview_song_ids text[],
  owner_id uuid,
  owner_display_name text,
  is_collaborator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_public,
    p.created_at,
    (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
    (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count,
    p.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = p.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids,
    p.user_id as owner_id,
    coalesce(prof.display_name, '') as owner_display_name,
    (p.user_id <> uid) as is_collaborator
  from public.playlists p
  left join public.profiles prof on prof.id = p.user_id
  where uid = auth.uid()
    and (
      p.user_id = uid
      or exists (
        select 1 from public.playlist_collaborators c
        where c.playlist_id = p.id and c.user_id = uid and c.status = 'accepted'
      )
    )
  order by p.created_at desc;
$$;

grant execute on function public.my_playlists_overview(uuid) to authenticated;

-- ===== 0037_playlist_security.sql =====
-- The cover_url guard trigger lives only in the migration (it needs the
-- bucket URL filled in); the saved-playlists change is repeated here.

drop function if exists public.saved_playlists_for_user(uuid);
create function public.saved_playlists_for_user(uid uuid)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  owner_display_name text,
  song_count int,
  saved_at timestamptz,
  save_count int,
  cover_url text,
  preview_song_ids text[]
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
    s.saved_at,
    (select count(*) from public.playlist_saves s2 where s2.playlist_id = p.id)::int as save_count,
    p.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = p.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids
  from public.playlist_saves s
  join public.playlists p on p.id = s.playlist_id
  left join public.profiles prof on prof.id = p.user_id
  where s.user_id = uid
    and uid = auth.uid()
    and p.is_public = true
  order by s.saved_at desc;
$$;

revoke execute on function public.saved_playlists_for_user(uuid) from public, anon;
grant execute on function public.saved_playlists_for_user(uuid) to authenticated;

-- ===== 0038_artist_monthly_listeners.sql =====
create or replace function public.artist_monthly_listeners(artist_name text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(user_id::text, 'device:' || device_id))::int
  from public.plays
  where artist = artist_name
    and played_at > now() - interval '30 days'
    and (user_id is not null or device_id is not null);
$$;

grant execute on function public.artist_monthly_listeners(text) to anon, authenticated;

-- ===== 0039_artist_banners.sql =====
-- Artist banners. Anyone signed in can suggest a banner image for an artist;
-- an admin approves it, and the approved banner then shows on the artist's
-- page (artists with none get a mosaic of their songs' covers, like
-- playlists). Artists are not rows anywhere: a banner is attached to the
-- accent- and case-insensitive form of the artist's name (`artist_key`), which
-- the approve function computes with the same code the app uses to compare
-- names, from the name the admin saw.
--
-- The images live in the image bucket (R2); only their URLs are stored here.
-- Uploading and approving go through Pages functions (functions/api/
-- artist-banners/), which write to the bucket.

-- The banner currently shown for an artist. Public to read; only admins write
-- (the approve function does so with the admin's own token).
create table if not exists public.artist_banners (
  artist_key text primary key,
  artist_name text not null,
  banner_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.artist_banners enable row level security;

drop policy if exists "artist_banners_read" on public.artist_banners;
create policy "artist_banners_read" on public.artist_banners
  for select using (true);

drop policy if exists "artist_banners_admin_write" on public.artist_banners;
create policy "artist_banners_admin_write" on public.artist_banners
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Suggestions waiting for (or already given) a decision.
create table if not exists public.artist_banner_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists artist_banner_submissions_status_idx
  on public.artist_banner_submissions (status, created_at);

alter table public.artist_banner_submissions enable row level security;

-- No insert policy: suggestions are created by submit_artist_banner() below,
-- which enforces the limits.
drop policy if exists "artist_banner_submissions_read_own" on public.artist_banner_submissions;
create policy "artist_banner_submissions_read_own" on public.artist_banner_submissions
  for select using (user_id = auth.uid());

drop policy if exists "artist_banner_submissions_admin_read" on public.artist_banner_submissions;
create policy "artist_banner_submissions_admin_read" on public.artist_banner_submissions
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "artist_banner_submissions_admin_update" on public.artist_banner_submissions;
create policy "artist_banner_submissions_admin_update" on public.artist_banner_submissions
  for update using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Starts a suggestion and returns its id; the image is uploaded against that
-- id afterwards. A user may have 3 suggestions waiting and make 10 a day.
create or replace function public.submit_artist_banner(artist_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  name_clean text := btrim(coalesce(artist_name, ''));
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to suggest a banner';
  end if;
  if name_clean = '' or length(name_clean) > 200 then
    raise exception 'Invalid artist name';
  end if;

  -- Each suggestion is uploaded once and never changed afterwards (so an
  -- admin approves exactly what they looked at). Suggesting again for the
  -- same artist therefore supersedes the earlier waiting one with a new id.
  update public.artist_banner_submissions
  set status = 'rejected'
  where user_id = auth.uid()
    and lower(artist_name) = lower(name_clean)
    and status = 'pending';

  if (
    select count(*) from public.artist_banner_submissions
    where user_id = auth.uid() and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Too many suggestions today';
  end if;
  if (
    select count(*) from public.artist_banner_submissions
    where user_id = auth.uid() and status = 'pending'
  ) >= 3 then
    raise exception 'Too many suggestions waiting for approval';
  end if;

  insert into public.artist_banner_submissions (user_id, artist_name)
  values (auth.uid(), name_clean)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.submit_artist_banner(text) to authenticated;
