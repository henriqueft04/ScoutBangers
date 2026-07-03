-- Redefine stats_plays_per_day to support all-time stats (when days is null or <= 0)
create or replace function public.stats_plays_per_day(days int default 30)
returns table (day date, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case
      when days is null or days <= 0 then
        (select coalesce(min(played_at)::date, current_date - 29) from public.plays)
      else
        current_date - (days - 1)
    end as start_date
  ),
  series as (
    select generate_series(
      (select start_date from bounds),
      current_date,
      '1 day'::interval
    )::date as day
  ),
  counts as (
    select date_trunc('day', played_at)::date as day, count(*)::bigint as play_count
    from public.plays
    where played_at >= (select start_date from bounds)
    group by 1
  )
  select s.day, coalesce(c.play_count, 0)::bigint as play_count
  from series s
  left join counts c on c.day = s.day
  order by s.day;
$$;

grant execute on function public.stats_plays_per_day(int) to anon, authenticated;

-- Redefine stats_top_songs_weekly to support all-time stats (when weeks_back is null or <= 0)
create or replace function public.stats_top_songs_weekly(weeks_back int default 8)
returns table (week_start date, song_id text, rank int, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case
      when weeks_back is null or weeks_back <= 0 then
        (select coalesce(date_trunc('week', min(played_at))::date, date_trunc('week', now())::date) from public.plays)
      else
        (date_trunc('week', now())::date - (weeks_back - 1) * 7)
    end as start_date
  ),
  weekly as (
    select
      date_trunc('week', p.played_at)::date as week_start,
      p.song_id,
      count(*)::bigint as play_count
    from public.plays p
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
  where rank <= 10
  order by week_start, rank;
$$;

grant execute on function public.stats_top_songs_weekly(int) to anon, authenticated;
