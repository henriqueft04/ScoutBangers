-- ScoutBangers v5 — group statistics page
--
-- Adds aggregate RPCs for the new /estatisticas page. All functions are
-- SECURITY DEFINER + search_path locked, granted to anon + authenticated.
--
-- Privacy:
--   * Aggregate stats (songs, artists, daily counts, summary) include
--     anonymous plays as well as plays by users who opted out of activity
--     sharing — these aggregates never expose *who* listened.
--   * Per-user stats (top listeners) only surface profiles with
--     share_activity = true, plus the caller themselves.

-- ===== 1. Top songs per week (bump-chart data) =======================
-- Returns top 10 songs for each of the most recent `weeks_back` weeks
-- (Monday-anchored). Used by the bump chart that shows rank shifts.
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

-- ===== 2. Top listeners (week / month / all) =========================
-- Excludes anonymous plays (no user_id) and respects share_activity.
create or replace function public.stats_top_listeners(period text default 'week', lim int default 10)
returns table (user_id uuid, display_name text, avatar_url text, play_count bigint)
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
    p.user_id,
    pr.display_name,
    pr.avatar_url,
    count(*)::bigint as play_count
  from public.plays p
  join public.profiles pr on pr.id = p.user_id
  where p.user_id is not null
    and p.played_at >= (select start_ts from bounds)
    and (pr.share_activity = true or auth.uid() = p.user_id)
  group by p.user_id, pr.display_name, pr.avatar_url
  order by play_count desc, max(p.played_at) desc
  limit greatest(lim, 0);
$$;

-- ===== 3. Top artists (last N days, or all-time when days IS NULL) ===
create or replace function public.stats_top_artists(days int default null, lim int default 10)
returns table (artist text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case
      when days is null then '-infinity'::timestamptz
      else now() - (days || ' days')::interval
    end as start_ts
  )
  select
    p.artist,
    count(*)::bigint as play_count
  from public.plays p
  where p.played_at >= (select start_ts from bounds)
    and p.artist is not null
    and p.artist <> ''
  group by p.artist
  order by play_count desc
  limit greatest(lim, 0);
$$;

-- ===== 4. Daily play counts (zero-filled) ============================
-- Used for the "Atividade" line chart. Generates a continuous date
-- series so the chart shows a proper baseline on quiet days.
create or replace function public.stats_plays_per_day(days int default 30)
returns table (day date, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with series as (
    select generate_series(
      (current_date - (greatest(days, 1) - 1))::date,
      current_date,
      '1 day'::interval
    )::date as day
  ),
  counts as (
    select date_trunc('day', played_at)::date as day, count(*)::bigint as play_count
    from public.plays
    where played_at >= (current_date - (greatest(days, 1) - 1))
    group by 1
  )
  select s.day, coalesce(c.play_count, 0)::bigint as play_count
  from series s
  left join counts c on c.day = s.day
  order by s.day;
$$;

-- ===== 5. Hero summary cards =========================================
create or replace function public.stats_summary(period text default 'week')
returns table (
  total_plays bigint,
  unique_songs bigint,
  unique_artists bigint,
  biggest_day date,
  biggest_day_count bigint
)
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
  ),
  filtered as (
    select p.song_id, p.artist, p.played_at
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
    (select count(*)::bigint from filtered) as total_plays,
    (select count(distinct song_id)::bigint from filtered) as unique_songs,
    (select count(distinct artist)::bigint from filtered
       where artist is not null and artist <> '') as unique_artists,
    (select day from by_day) as biggest_day,
    (select c from by_day) as biggest_day_count;
$$;

-- ===== Grants =========================================================
grant execute on function public.stats_top_songs_weekly(int) to anon, authenticated;
grant execute on function public.stats_top_listeners(text, int) to anon, authenticated;
grant execute on function public.stats_top_artists(int, int) to anon, authenticated;
grant execute on function public.stats_plays_per_day(int) to anon, authenticated;
grant execute on function public.stats_summary(text) to anon, authenticated;
