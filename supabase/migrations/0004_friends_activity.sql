-- ScoutBangers v3 — friends activity feed
-- Adds a SECURITY DEFINER function exposing recent plays joined with
-- the player's profile info. Granted to anon + authenticated so the
-- feed renders pre-sign-in too.

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
  select
    p.song_id,
    p.user_id,
    prof.display_name,
    prof.avatar_url,
    p.played_at
  from public.plays p
  join public.profiles prof on prof.id = p.user_id
  where p.user_id is not null
  order by p.played_at desc
  limit lim;
$$;

grant execute on function public.recent_plays(int) to anon, authenticated;
