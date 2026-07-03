-- Add device_id to plays to track unique devices in play history
alter table public.plays
  add column if not exists device_id text;

-- Create an index for performance when counting distinct devices
create index if not exists plays_device_idx on public.plays(device_id);

-- Create active_devices table to track current playing status (heartbeats)
create table if not exists public.active_devices (
  device_id text primary key,
  is_playing boolean not null default false,
  last_seen_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) on active_devices
alter table public.active_devices enable row level security;

-- Policy to allow anyone (anon or authenticated) to manage their device presence
drop policy if exists "allow_anon_all" on public.active_devices;
create policy "allow_anon_all" on public.active_devices
  for all using (true) with check (true);

-- Drop and recreate stats_summary to return active devices and total profiles
drop function if exists public.stats_summary(text);
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
    select case period
      when 'week'  then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else '-infinity'::timestamptz
    end as start_ts
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

grant execute on function public.stats_summary(text) to anon, authenticated;
