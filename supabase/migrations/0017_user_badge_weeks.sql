-- ScoutBangers — list a user's weekly badges for a given rank
--
-- Powers the "click on a medal" modal: returns every week the user
-- placed at the chosen rank, with the play count for that week.
-- Respects the same show_badges privacy gate as get_user_badges.

create or replace function public.get_user_badge_weeks(uid uuid, rank_in smallint)
returns table (week_start date, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select pr.show_badges or auth.uid() = pr.id as can_see
    from public.profiles pr
    where pr.id = uid
  )
  select wb.week_start, wb.play_count
  from public.weekly_badges wb
  where wb.user_id = uid
    and wb.rank = rank_in
    and (select can_see from visible)
  order by wb.week_start desc;
$$;

grant execute on function public.get_user_badge_weeks(uuid, smallint) to anon, authenticated;
