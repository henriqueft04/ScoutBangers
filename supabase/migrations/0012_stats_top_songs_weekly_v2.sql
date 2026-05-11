-- ScoutBangers v5 — bump-chart data v2
--
-- v1 picked the top 10 *per week*, which meant a song could appear in
-- one week and disappear the next, leaving the bump chart with
-- isolated dots instead of lines.
--
-- v2 picks the top 10 by *total* plays across the whole window, then
-- tracks each of those 10 songs' rank within the group week by week.
-- The chart now always shows 10 lines, with gaps where a song had no
-- plays that week (which the renderer bridges).

create or replace function public.stats_top_songs_weekly(weeks_back int default 8)
returns table (week_start date, song_id text, rank int, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (date_trunc('week', now())::date - (greatest(weeks_back, 1) - 1) * 7) as start_date
  ),
  top_overall as (
    select p.song_id
    from public.plays p
    where p.played_at >= (select start_date from bounds)
    group by p.song_id
    order by count(*) desc, max(p.played_at) desc
    limit 10
  ),
  weekly as (
    select
      date_trunc('week', p.played_at)::date as week_start,
      p.song_id,
      count(*)::bigint as play_count
    from public.plays p
    join top_overall t on t.song_id = p.song_id
    where p.played_at >= (select start_date from bounds)
    group by 1, 2
  ),
  ranked as (
    select
      week_start,
      song_id,
      play_count,
      row_number() over (
        partition by week_start
        order by play_count desc, song_id
      ) as rank
    from weekly
  )
  select week_start, song_id, rank::int, play_count
  from ranked
  order by week_start, rank;
$$;
