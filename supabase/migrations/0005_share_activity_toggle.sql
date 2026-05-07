-- ScoutBangers v3 — privacy toggle for friends activity feed
-- Adds a `share_activity` boolean to profiles (default true) and
-- updates the recent_plays function to filter out users who have
-- opted out.

alter table public.profiles
  add column if not exists share_activity boolean not null default true;

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
    and prof.share_activity = true
  order by p.played_at desc
  limit lim;
$$;

grant execute on function public.recent_plays(int) to anon, authenticated;
