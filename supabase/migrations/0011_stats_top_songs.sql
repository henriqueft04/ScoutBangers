-- ScoutBangers v5 — top songs RPC
--
-- Companion to stats_top_listeners / stats_top_artists. Returns the
-- most-played songs over a period (week / month / all). Includes
-- anonymous plays in the totals (matches the rest of the aggregate
-- stats; only per-listener stats filter on share_activity).

create or replace function public.stats_top_songs(period text default 'week', lim int default 10)
returns table (song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case period
      when 'week' then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else '-infinity'::timestamptz
    end as start_ts
  )
  select
    p.song_id,
    count(*)::bigint as play_count
  from public.plays p
  where p.played_at >= (select start_ts from bounds)
  group by p.song_id
  order by play_count desc, max(p.played_at) desc
  limit greatest(lim, 0);
$$;

grant execute on function public.stats_top_songs(text, int) to anon, authenticated;
