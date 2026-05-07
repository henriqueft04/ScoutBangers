-- ScoutBangers v3 — refine recent_plays to show one row per friend and
-- exclude the calling user from their own feed.

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
  select song_id, user_id, display_name, avatar_url, played_at
  from (
    -- DISTINCT ON keeps only the most recent play per user.
    -- IS DISTINCT FROM auth.uid() excludes the caller's own plays
    -- (and works for anon callers too — auth.uid() is null then,
    -- so every non-null user_id is "distinct" and stays in).
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

grant execute on function public.recent_plays(int) to anon, authenticated;
