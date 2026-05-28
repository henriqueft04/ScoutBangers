-- Add duration_seconds to plays so we can track total listening time.
-- NULL for rows recorded before this migration (no backfill).

alter table public.plays
  add column if not exists duration_seconds integer;

-- Drop and recreate stats_summary — return type changed (added total_seconds).
drop function if exists public.stats_summary(text);
create or replace function public.stats_summary(period text default 'week')
returns table (
  total_plays      bigint,
  unique_songs     bigint,
  unique_artists   bigint,
  biggest_day      date,
  biggest_day_count bigint,
  total_seconds    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case period
      when 'week'  then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else '-infinity'::timestamptz
    end as start_ts
  ),
  filtered as (
    select p.song_id, p.artist, p.played_at, p.duration_seconds
    from public.plays p
    where p.played_at >= (select start_ts from bounds)
  ),
  by_day as (
    select date_trunc('day', played_at)::date as day, count(*)::bigint as c
    from filtered
    group by 1
    order by c desc
    limit 1
  )
  select
    (select count(*)::bigint                          from filtered)           as total_plays,
    (select count(distinct song_id)::bigint           from filtered)           as unique_songs,
    (select count(distinct artist)::bigint            from filtered
       where artist is not null and artist <> '')                              as unique_artists,
    (select day   from by_day)                                                 as biggest_day,
    (select c     from by_day)                                                 as biggest_day_count,
    (select coalesce(sum(duration_seconds), 0)::bigint from filtered)         as total_seconds;
$$;

grant execute on function public.stats_summary(text) to anon, authenticated;
