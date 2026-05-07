-- ScoutBangers v3 — public profile pages
-- Adds an is_public column to playlists (default true), keeps Favorites
-- private, and lets anyone read public playlists + stats so /u/:userId
-- pages can be viewed without signing in.

-- 1. Per-playlist visibility flag.
alter table public.playlists
  add column if not exists is_public boolean not null default true;

-- 2. Mark every existing Favorites playlist private (one-time backfill).
update public.playlists
  set is_public = false
  where name = 'Favorites';

-- 3. Open up reads to public playlists for everyone (still requires
--    auth for reading own private playlists — see existing policy).
drop policy if exists "playlists_read_public" on public.playlists;
create policy "playlists_read_public" on public.playlists
  for select
  using (is_public = true);

drop policy if exists "playlist_songs_read_public" on public.playlist_songs;
create policy "playlist_songs_read_public" on public.playlist_songs
  for select
  using (
    exists (
      select 1 from public.playlists
      where id = playlist_id and is_public = true
    )
  );

-- 4. Stats RPCs were authenticated-only; anonymous visitors should see
--    a profile's top songs/artists too.
grant execute on function public.top_songs_for_user(uuid, int) to anon;
grant execute on function public.top_artists_for_user(uuid, int) to anon;
