-- Playlist discovery: save counts for the owner's own playlists and a
-- searchable list of other people's public playlists. playlist_saves is
-- saver-only under RLS, so the counts are exposed through security
-- definer functions (same approach as playlist_save_count).

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
