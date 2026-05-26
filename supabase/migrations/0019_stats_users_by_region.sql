-- ScoutBangers — registered users by region/núcleo
--
-- Counts distinct registered users grouped by regiao/nucleo.
-- No period filter — this reflects the current profile state.

create or replace function public.stats_users_by_region(lim int default 10)
returns table (regiao text, nucleo text, user_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.regiao,
    pr.nucleo,
    count(*)::bigint as user_count
  from public.profiles pr
  where pr.regiao is not null
  group by pr.regiao, pr.nucleo
  order by user_count desc
  limit greatest(lim, 0);
$$;

grant execute on function public.stats_users_by_region(int) to anon, authenticated;
