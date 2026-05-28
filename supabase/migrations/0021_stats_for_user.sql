-- Per-user listening stats: total seconds listened + total plays.
-- Used on profile pages (personal + public).
create or replace function public.stats_for_user(uid uuid)
returns table (total_seconds bigint, total_plays bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(duration_seconds), 0)::bigint as total_seconds,
    count(*)::bigint                            as total_plays
  from public.plays
  where user_id = uid;
$$;

grant execute on function public.stats_for_user(uuid) to anon, authenticated;
