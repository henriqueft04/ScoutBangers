-- Two hardening fixes for playlists.
--
-- 1) cover_url may only point at the app's own image bucket. RLS can't
--    restrict column values, so without this a user could store any URL and
--    every viewer's browser would load it (leaking their IP to a third party).
--    BEFORE RUNNING: replace the base URL below with the value of
--    AVATAR_PUBLIC_BASE_URL (the public URL of the R2 bucket, no trailing
--    slash). The script refuses to run while the placeholder is still there.
--
-- 2) saved_playlists_for_user only answers for the caller; it used to take
--    any user id and was open to signed-out visitors.

do $$
declare
  base constant text := 'https://avatars.scoutbangers.com';
begin
  if base like '%REPLACE_WITH%' then
    raise exception 'Set the bucket base URL in 0037_playlist_security.sql first';
  end if;

  -- The base is baked into the function body; a "/" follows it so
  -- "https://cdn.example.com.evil.com/..." can't pass as the bucket.
  execute format($fn$
    create or replace function public.guard_playlist_cover()
    returns trigger
    language plpgsql
    as $body$
    begin
      if auth.uid() is not null
         and new.cover_url is not null
         and new.cover_url is distinct from (
           case when tg_op = 'UPDATE' then old.cover_url end
         )
         and left(new.cover_url, %s) <> %L then
        raise exception 'Cover must be an image uploaded through the app';
      end if;
      return new;
    end;
    $body$;
  $fn$, length(base || '/'), base || '/');
end;
$$;

drop trigger if exists guard_playlist_cover on public.playlists;
create trigger guard_playlist_cover
  before insert or update of cover_url on public.playlists
  for each row execute function public.guard_playlist_cover();

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
