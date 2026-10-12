-- ScoutBangers — "this week" means the same week everywhere
--
-- Until now the stats page's "Esta semana" was a rolling last-7-days window
-- while the weekly listener badges (0016) and the home page's weekly top
-- (0028) use the calendar week that starts Monday 00:00 UTC. So the same
-- label gave different numbers on different pages.
--
-- From here on a period's start lives in ONE function, `stats_period_start`,
-- and every period-based stats RPC reads it. 'week' is the calendar week the
-- badges are awarded for; 'month' stays a rolling 30 days; anything else is
-- all time. Only the `bounds` expression of each function changes below.

-- ===== 1. The one definition of a period's start =====================
create or replace function public.stats_period_start(period text)
returns timestamptz
language sql
stable
as $$
  select case
    -- 'current_week' is what the home page sent before it moved to 'week'
    -- (0028); kept so clients still running that build keep working.
    when period in ('week', 'current_week')
      then public.current_week_start()::timestamp at time zone 'utc'
    when period = 'month' then now() - interval '30 days'
    else '-infinity'::timestamptz
  end;
$$;

-- ===== 2. Top songs ==================================================
create or replace function public.stats_top_songs(period text default 'week', lim int default 10)
returns table (song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select public.stats_period_start(period) as start_ts
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

-- ===== 3. Top listeners ==============================================
-- Excludes anonymous plays (no user_id) and respects share_activity.
create or replace function public.stats_top_listeners(period text default 'week', lim int default 10)
returns table (user_id uuid, display_name text, avatar_url text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select public.stats_period_start(period) as start_ts
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

-- ===== 4. Listeners by region ========================================
create or replace function public.stats_listeners_by_region(
  period text default 'week',
  lim int default 10
)
returns table (regiao text, nucleo text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select public.stats_period_start(period) as start_ts
  )
  select
    pr.regiao,
    pr.nucleo,
    count(*)::bigint as play_count
  from public.plays p
  join public.profiles pr on pr.id = p.user_id
  where p.user_id is not null
    and pr.regiao is not null
    and p.played_at >= (select start_ts from bounds)
    and (pr.share_activity = true or auth.uid() = p.user_id)
  group by pr.regiao, pr.nucleo
  order by play_count desc
  limit greatest(lim, 0);
$$;

-- ===== 5. Summary ====================================================
create or replace function public.stats_summary(period text default 'week')
returns table (
  total_plays      bigint,
  unique_songs     bigint,
  unique_artists   bigint,
  biggest_day      date,
  biggest_day_count bigint,
  total_seconds    bigint,
  total_devices    bigint,
  total_users      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select public.stats_period_start(period) as start_ts
  ),
  filtered as (
    select p.song_id, p.artist, p.played_at, p.duration_seconds, p.device_id, p.user_id
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
    (select coalesce(sum(duration_seconds), 0)::bigint from filtered)         as total_seconds,
    (select count(*)::bigint                          from public.active_devices
       where is_playing = true
         and last_seen_at >= now() - interval '30 seconds')                    as total_devices,
    (select count(*)::bigint                          from public.profiles)    as total_users;
$$;

grant execute on function public.stats_top_songs(text, int) to anon, authenticated;
grant execute on function public.stats_top_listeners(text, int) to anon, authenticated;
grant execute on function public.stats_listeners_by_region(text, int) to anon, authenticated;
grant execute on function public.stats_summary(text) to anon, authenticated;
