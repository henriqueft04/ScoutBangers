-- ===== playlist_saves =========================================
-- A signed-in user can "save" any other user's PUBLIC playlist:
-- the playlist appears in their own Playlists page under "Saved",
-- they can play it like any of their own, but the original owner
-- still controls its content. The same row is also the "like" —
-- everyone can read the COUNT for any playlist (even private
-- ones — count is just 0 in practice for those) so a public
-- counter can be shown.
--
-- Owners can't save their own playlists (already in their list).

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

-- Anyone (including anon) can READ saves — needed for the public
-- like-count display and to know whether the current user has
-- saved a given playlist.
drop policy if exists "playlist_saves readable by anyone" on public.playlist_saves;
create policy "playlist_saves readable by anyone"
  on public.playlist_saves
  for select
  using (true);

-- A user can save a public playlist they don't already own.
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

-- A user can unsave anything they themselves saved.
drop policy if exists "users unsave their own saves" on public.playlist_saves;
create policy "users unsave their own saves"
  on public.playlist_saves
  for delete
  using (auth.uid() = user_id);

-- Cheap save-count RPC so the client doesn't fetch the full row set
-- just to count it. Returns the number of distinct savers for a
-- given playlist.
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

-- For listing a user's saved playlists alongside their own — joins
-- the saves table to playlists with the owner's display name.
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
