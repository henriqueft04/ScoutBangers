-- ScoutBangers — weekly listener badges
--
-- Awards top-3 weekly listener badges. Persisted so history survives even
-- if `plays` rows are pruned later. Users can hide all of their badges
-- via a single `show_badges` toggle on the profile (defaults to TRUE).
--
-- A Monday-morning pg_cron job snapshots the prior ISO week's top 3.

-- ===== 1. Profile flag ===============================================
alter table public.profiles
  add column if not exists show_badges boolean not null default true;

-- ===== 2. Badges table ===============================================
create table if not exists public.weekly_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  rank       smallint not null check (rank between 1 and 3),
  play_count bigint not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists weekly_badges_user_idx
  on public.weekly_badges (user_id);
create index if not exists weekly_badges_week_idx
  on public.weekly_badges (week_start);

alter table public.weekly_badges enable row level security;

-- Anyone can read badges; visibility is filtered by the RPC below.
drop policy if exists "weekly_badges read" on public.weekly_badges;
create policy "weekly_badges read"
  on public.weekly_badges for select
  using (true);

-- Only the SECURITY DEFINER award function writes here — no direct insert/update policies.

-- ===== 3. Award function =============================================
-- Computes the top 3 listeners for the most recently completed ISO week
-- (Monday-anchored) and inserts a row per winner. Idempotent: a re-run
-- for the same week is a no-op thanks to the PK.
--
-- Anonymous plays (user_id IS NULL) are excluded. Unlike the leaderboard
-- RPC, `share_activity` does NOT gate eligibility — privacy of the badge
-- itself is controlled by `profiles.show_badges`.
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
  wk_start := coalesce(target_week, (date_trunc('week', now())::date - 7));
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

-- ===== 4. Read RPC ===================================================
-- Returns badge counts (rank → count) for a user. Respects show_badges:
-- if the target user has hidden their badges, only they themselves get
-- non-zero counts back. The caller's own profile is always visible.
create or replace function public.get_user_badges(uid uuid)
returns table (rank smallint, badge_count bigint)
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
  select wb.rank, count(*)::bigint as badge_count
  from public.weekly_badges wb
  where wb.user_id = uid
    and (select can_see from visible)
  group by wb.rank
  order by wb.rank;
$$;

-- ===== 5. Grants =====================================================
grant select on public.weekly_badges to anon, authenticated;
grant execute on function public.award_weekly_badges(date) to authenticated;
grant execute on function public.get_user_badges(uuid) to anon, authenticated;

-- ===== 6. Schedule ===================================================
-- Runs every Monday at 03:15 UTC to snapshot the prior ISO week.
-- Requires the pg_cron extension (enabled by default on Supabase Pro;
-- enable from Database → Extensions on the free tier).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'award_weekly_badges') then
      perform cron.unschedule('award_weekly_badges');
    end if;
    perform cron.schedule(
      'award_weekly_badges',
      '15 3 * * 1',
      $cron$ select public.award_weekly_badges(); $cron$
    );
  end if;
end;
$$;
