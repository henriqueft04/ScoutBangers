-- ScoutBangers — home page "top of the week", synced with the weekly badges
--
-- The weekly listener badges (0016) close an ISO week on Monday 00:00 UTC
-- and are awarded by a Monday 03:15 UTC job. The home page's weekly top
-- songs must reset on that very boundary, so the boundary now lives in ONE
-- place — `current_week_start()` — and both the badge job and the top-songs
-- RPC read it. They cannot drift apart.

-- ===== 1. The shared week boundary ===================================
-- Monday 00:00 UTC of the current ISO week.
create or replace function public.current_week_start()
returns date
language sql
stable
as $$
  select date_trunc('week', now() at time zone 'utc')::date;
$$;

-- ===== 2. Badge job: use the shared boundary =========================
-- Identical to 0016 except the default week now comes from
-- current_week_start() instead of its own date_trunc.
create or replace function public.award_weekly_badges(target_week date default null)
returns table (user_id uuid, rank smallint, play_count bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  wk_start date;
  wk_end   date;
begin
  -- Default to the previous completed ISO week.
  wk_start := coalesce(target_week, public.current_week_start() - 7);
  wk_end   := wk_start + 7;

  insert into public.weekly_badges (user_id, week_start, rank, play_count)
  select
    ranked.user_id,
    wk_start,
    ranked.rank::smallint,
    ranked.play_count
  from (
    select
      p.user_id,
      count(*)::bigint as play_count,
      row_number() over (order by count(*) desc, max(p.played_at) desc) as rank
    from public.plays p
    where p.user_id is not null
      and p.played_at >= wk_start
      and p.played_at <  wk_end
    group by p.user_id
  ) ranked
  where ranked.rank <= 3
  on conflict (user_id, week_start) do nothing;

  return query
    select wb.user_id, wb.rank, wb.play_count
    from public.weekly_badges wb
    where wb.week_start = wk_start
    order by wb.rank;
end;
$$;

-- ===== 3. Top songs: a "current_week" period =========================
-- 'week' stays a rolling 7 days (the stats page uses it). 'current_week'
-- is the calendar week the badges are about: it starts empty each Monday.
create or replace function public.stats_top_songs(period text default 'week', lim int default 10)
returns table (song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case period
      when 'current_week' then public.current_week_start()::timestamp at time zone 'utc'
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
grant execute on function public.award_weekly_badges(date) to authenticated;
