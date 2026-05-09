-- Security hardening based on the audit:
--
--   H1/H2 — UPDATE policies on `playlists` and `playlist_songs` were
--           USING-only (no WITH CHECK). A user could change the
--           user_id on their own row to "donate" a playlist into
--           another account, or move a playlist_songs row into a
--           playlist they don't own.
--
--   H3   — top_songs_for_user / top_artists_for_user ignored the
--           `share_activity` opt-out. Anyone with a userId could
--           pull listening stats even after the user opted out.
--
--   M5   — playlist_saves SELECT was open to anyone, exposing the
--           full (user_id, playlist_id) pair set instead of just
--           the public count + the saver's own list. Tightened to
--           "only your own rows", with a new RPC for "is this
--           playlist saved by user X".

-- ===== H1 + H2: WITH CHECK on UPDATE =================================

drop policy if exists "playlists_update_own" on public.playlists;
create policy "playlists_update_own" on public.playlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

-- ===== H3: honor share_activity in per-user RPCs =====================

create or replace function public.top_songs_for_user(uid uuid, lim int default 10)
returns table (song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  -- Returns nothing when the target user has opted out of activity
  -- sharing, or when share_activity is missing entirely (defensive).
  -- The user's own profile can always read its own stats — handled
  -- by allowing auth.uid() = uid to bypass the opt-out check.
  select p.song_id, count(*)::bigint as play_count
  from public.plays p
  where p.user_id = uid
    and (
      auth.uid() = uid
      or exists (
        select 1 from public.profiles pr
        where pr.id = uid and pr.share_activity = true
      )
    )
  group by p.song_id
  order by play_count desc, max(p.played_at) desc
  limit greatest(lim, 0);
$$;

create or replace function public.top_artists_for_user(uid uuid, lim int default 10)
returns table (artist text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.artist, count(*)::bigint as play_count
  from public.plays p
  where p.user_id = uid
    and p.artist is not null
    and p.artist <> ''
    and (
      auth.uid() = uid
      or exists (
        select 1 from public.profiles pr
        where pr.id = uid and pr.share_activity = true
      )
    )
  group by p.artist
  order by play_count desc
  limit greatest(lim, 0);
$$;

grant execute on function public.top_songs_for_user(uuid, int) to anon, authenticated;
grant execute on function public.top_artists_for_user(uuid, int) to anon, authenticated;

-- ===== M5: lock down playlist_saves SELECT ===========================

drop policy if exists "playlist_saves readable by anyone" on public.playlist_saves;
create policy "playlist_saves visible only to the saver"
  on public.playlist_saves
  for select
  using (auth.uid() = user_id);

-- The previous SELECT policy was the path the client used for the
-- "is this playlist saved by me" check (lib/playlist-saves.ts).
-- That call still works under the new policy because it filters
-- on auth.uid() = user_id. Public counts continue to come from the
-- existing `playlist_save_count` SECURITY DEFINER RPC.

-- New RPC for the same check, but typed and SECURITY DEFINER so it
-- doesn't depend on the SELECT policy at all. The client can switch
-- to this in a follow-up if desired.
create or replace function public.is_playlist_saved_by(uid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playlist_saves
    where user_id = uid and playlist_id = pid
  );
$$;

grant execute on function public.is_playlist_saved_by(uuid, uuid) to anon, authenticated;
