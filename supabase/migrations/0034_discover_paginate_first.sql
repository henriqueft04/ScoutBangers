-- discover_public_playlists used to compute song_count, save_count and the
-- cover preview for EVERY public playlist, then sort and keep one page.
-- Now only what the filter and the sort need is computed for all candidates
-- (name match, "has songs", save_count); the song count and the cover preview
-- are looked up afterwards, for the 20 rows of the page only.
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
