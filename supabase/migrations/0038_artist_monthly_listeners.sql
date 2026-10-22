-- Monthly listeners of an artist: distinct people who played one of their
-- songs in the last 30 days. A signed-in user counts once (whatever the
-- device); a signed-out listener counts once per device (plays.device_id, set
-- by the app). Plays with neither can't be told apart and are left out.
--
-- Security definer because plays are only readable by their owner, and only a
-- count leaves the function. Uses plays_artist_idx, so keep that index.
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
