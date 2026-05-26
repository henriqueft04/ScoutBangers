-- ScoutBangers — listeners by region/núcleo stats
--
-- Counts plays grouped by the listener's regiao and nucleo (from profiles).
-- Only counts registered users with share_activity = true (or the caller).
-- Rows where regiao is null are excluded.

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
    select case period
      when 'week'  then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else '-infinity'::timestamptz
    end as start_ts
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

grant execute on function public.stats_listeners_by_region(text, int) to anon, authenticated;
