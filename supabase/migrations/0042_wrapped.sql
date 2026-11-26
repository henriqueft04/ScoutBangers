-- ScoutBangers Wrapped: a user's year in listening, in one round-trip.
--
-- Returns a single jsonb document with everything the /wrapped story shows:
-- totals, top songs/artists, monthly/hourly/weekday shape, biggest day,
-- longest streak, and community comparisons (percentile, rank in região /
-- agrupamento, fan rank for the top artist). Only aggregates ever leave the
-- function — never another user's plays.
--
-- Private: returns NULL unless the caller is the user asked about. People
-- share their Wrapped as images, not through this RPC.
--
-- Days, hours and weekdays are bucketed in Europe/Lisbon, which is where the
-- listeners are. The year window is [yr-01-01, yr+1-01-01) local time.
create or replace function public.wrapped_for_user(uid uuid, yr int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  bounds as (
    select make_timestamptz(yr, 1, 1, 0, 0, 0, 'Europe/Lisbon') as start_ts,
           make_timestamptz(yr + 1, 1, 1, 0, 0, 0, 'Europe/Lisbon') as end_ts
  ),
  -- Every play of the year, for everyone (community comparisons).
  year_plays as (
    select p.user_id, p.song_id, p.artist, p.played_at,
           coalesce(p.duration_seconds, 0) as secs
    from public.plays p, bounds b
    where p.played_at >= b.start_ts and p.played_at < b.end_ts
  ),
  mine as (
    select yp.*,
           (yp.played_at at time zone 'Europe/Lisbon') as local_ts,
           (yp.played_at at time zone 'Europe/Lisbon')::date as local_day
    from year_plays yp
    where yp.user_id = uid
  ),
  per_user as (
    select user_id, count(*)::bigint as plays
    from year_plays
    where user_id is not null
    group by user_id
  ),
  my_total as (
    select coalesce((select plays from per_user where user_id = uid), 0) as plays
  ),
  me as (
    select pr.regiao, pr.agrupamento_numero from public.profiles pr where pr.id = uid
  ),
  -- Songs
  song_totals as (
    select song_id, count(*)::bigint as plays, sum(secs)::bigint as seconds,
           min(played_at) as first_played_at
    from mine group by song_id
    order by plays desc, seconds desc, song_id
    limit 5
  ),
  song_days as (
    select m.song_id, m.local_day, count(*)::bigint as c,
           row_number() over (partition by m.song_id order by count(*) desc, m.local_day) as rn
    from mine m
    where m.song_id in (select song_id from song_totals)
    group by m.song_id, m.local_day
  ),
  top_songs as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'song_id', st.song_id,
             'plays', st.plays,
             'seconds', st.seconds,
             'first_played_at', st.first_played_at,
             'best_day', sd.local_day,
             'best_day_plays', sd.c
           ) order by st.plays desc, st.seconds desc, st.song_id), '[]'::jsonb) as j
    from song_totals st
    left join song_days sd on sd.song_id = st.song_id and sd.rn = 1
  ),
  -- Artists
  artist_totals as (
    select artist, count(*)::bigint as plays, sum(secs)::bigint as seconds
    from mine
    where artist is not null and artist <> ''
    group by artist
    order by plays desc, seconds desc, artist
    limit 5
  ),
  top_artists as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'artist', artist, 'plays', plays, 'seconds', seconds
           ) order by plays desc, seconds desc, artist), '[]'::jsonb) as j
    from artist_totals
  ),
  top_artist as (
    select artist from artist_totals order by plays desc, seconds desc, artist limit 1
  ),
  fans as (
    select yp.user_id, count(*)::bigint as plays
    from year_plays yp
    where yp.user_id is not null
      and yp.artist = (select artist from top_artist)
    group by yp.user_id
  ),
  -- Shape of the year
  by_month as (
    select jsonb_agg(coalesce(c, 0) order by m) as j
    from generate_series(1, 12) m
    left join (
      select extract(month from local_ts)::int as mo, count(*)::bigint as c
      from mine group by 1
    ) x on x.mo = m
  ),
  by_hour as (
    select jsonb_agg(coalesce(c, 0) order by h) as j
    from generate_series(0, 23) h
    left join (
      select extract(hour from local_ts)::int as hr, count(*)::bigint as c
      from mine group by 1
    ) x on x.hr = h
  ),
  -- 0 = Monday … 6 = Sunday
  by_weekday as (
    select jsonb_agg(coalesce(c, 0) order by d) as j
    from generate_series(0, 6) d
    left join (
      select (extract(isodow from local_ts)::int - 1) as wd, count(*)::bigint as c
      from mine group by 1
    ) x on x.wd = d
  ),
  days as (
    select local_day, count(*)::bigint as plays, sum(secs)::bigint as seconds
    from mine group by local_day
  ),
  biggest_day as (
    select local_day, plays, seconds from days
    order by plays desc, local_day limit 1
  ),
  islands as (
    select local_day,
           local_day - (row_number() over (order by local_day))::int as grp
    from days
  ),
  streak as (
    select count(*)::int as len, min(local_day) as s, max(local_day) as e
    from islands group by grp
    order by len desc, s desc limit 1
  ),
  first_play as (
    select song_id, played_at from mine order by played_at limit 1
  ),
  -- Scout groups: listeners of the year who declared the same região /
  -- agrupamento. Shown only from 3 listeners up, so a rank never singles
  -- anyone out.
  regiao_group as (
    select pu.user_id, pu.plays
    from per_user pu
    join public.profiles pr on pr.id = pu.user_id
    where pr.regiao is not null and pr.regiao = (select regiao from me)
  ),
  agrup_group as (
    select pu.user_id, pu.plays
    from per_user pu
    join public.profiles pr on pr.id = pu.user_id
    where pr.agrupamento_numero is not null
      and pr.agrupamento_numero = (select agrupamento_numero from me)
      and pr.regiao is not distinct from (select regiao from me)
  ),
  badges as (
    select
      count(*) filter (where rank = 1)::int as gold,
      count(*) filter (where rank = 2)::int as silver,
      count(*) filter (where rank = 3)::int as bronze
    from public.weekly_badges wb
    where wb.user_id = uid
      and wb.week_start >= make_date(yr, 1, 1)
      and wb.week_start < make_date(yr + 1, 1, 1)
  ),
  community_song as (
    select song_id from year_plays group by song_id
    order by count(*) desc, song_id limit 1
  ),
  community_artist as (
    select artist from year_plays where artist is not null and artist <> ''
    group by artist order by count(*) desc, artist limit 1
  ),
  -- ScoutBangers' own year: growth of the community and the catalog of plays.
  community_top_songs as (
    select song_id, count(*)::bigint as plays from year_plays
    group by song_id order by plays desc, song_id limit 5
  ),
  community_months as (
    select jsonb_agg(coalesce(c, 0) order by m) as j
    from generate_series(1, 12) m
    left join (
      select extract(month from played_at at time zone 'Europe/Lisbon')::int as mo,
             count(*)::bigint as c
      from year_plays group by 1
    ) x on x.mo = m
  ),
  -- New accounts per month of the year, and how many existed before it.
  signups as (
    select jsonb_agg(coalesce(c, 0) order by m) as j
    from generate_series(1, 12) m
    left join (
      select extract(month from pr.created_at at time zone 'Europe/Lisbon')::int as mo,
             count(*)::bigint as c
      from public.profiles pr, bounds b
      where pr.created_at >= b.start_ts and pr.created_at < b.end_ts
      group by 1
    ) x on x.mo = m
  ),
  community_day as (
    select (played_at at time zone 'Europe/Lisbon')::date as d, count(*)::bigint as c
    from year_plays group by 1 order by c desc, d limit 1
  ),
  top_regiao as (
    select pr.regiao, count(*)::bigint as plays
    from year_plays yp
    join public.profiles pr on pr.id = yp.user_id
    where pr.regiao is not null
    group by pr.regiao order by plays desc, pr.regiao limit 1
  )
  select case when auth.uid() is distinct from uid then null else jsonb_build_object(
    'year', yr,
    'total_plays', (select count(*) from mine),
    'total_seconds', (select coalesce(sum(secs), 0) from mine),
    'unique_songs', (select count(distinct song_id) from mine),
    'unique_artists', (select count(distinct artist) from mine where artist is not null and artist <> ''),
    'active_days', (select count(*) from days),
    'first_play', (select jsonb_build_object('song_id', song_id, 'played_at', played_at) from first_play),
    'top_songs', (select j from top_songs),
    'top_artists', (select j from top_artists),
    'by_month', (select j from by_month),
    'by_hour', (select j from by_hour),
    'by_weekday', (select j from by_weekday),
    'biggest_day', (select jsonb_build_object('date', local_day, 'plays', plays, 'seconds', seconds) from biggest_day),
    'longest_streak', (select jsonb_build_object('days', len, 'start', s, 'end', e) from streak),
    'percentile', (
      select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where plays < (select plays from my_total)) / count(*))::int end
      from per_user
    ),
    'listeners_total', (select count(*) from per_user),
    'regiao_rank', (
      select case when count(*) >= 3 and (select plays from my_total) > 0 then jsonb_build_object(
        'name', (select regiao from me),
        'rank', 1 + count(*) filter (where plays > (select plays from my_total)),
        'size', count(*)
      ) end from regiao_group
    ),
    'agrupamento_rank', (
      select case when count(*) >= 3 and (select plays from my_total) > 0 then jsonb_build_object(
        'numero', (select agrupamento_numero from me),
        'rank', 1 + count(*) filter (where plays > (select plays from my_total)),
        'size', count(*)
      ) end from agrup_group
    ),
    'top_artist_fan_rank', (
      select case when count(*) > 0 then jsonb_build_object(
        'rank', 1 + count(*) filter (where plays > coalesce((select f.plays from fans f where f.user_id = uid), 0)),
        'fans', count(*)
      ) end from fans
    ),
    'badges', (select jsonb_build_object('gold', gold, 'silver', silver, 'bronze', bronze) from badges),
    'community', jsonb_build_object(
      'total_plays', (select count(*) from year_plays),
      'total_seconds', (select coalesce(sum(secs), 0) from year_plays),
      'listeners', (select count(*) from per_user),
      'top_song_id', (select song_id from community_song),
      'top_artist', (select artist from community_artist),
      'top_songs', (select coalesce(jsonb_agg(jsonb_build_object('song_id', song_id, 'plays', plays)
                      order by plays desc, song_id), '[]'::jsonb) from community_top_songs),
      'by_month', (select j from community_months),
      'signups_by_month', (select j from signups),
      'users_before', (select count(*) from public.profiles pr, bounds b where pr.created_at < b.start_ts),
      'users_total', (select count(*) from public.profiles),
      'playlists_created', (select count(*) from public.playlists pl, bounds b
                              where pl.created_at >= b.start_ts and pl.created_at < b.end_ts
                                and pl.name <> 'Favorites'),
      'biggest_day', (select jsonb_build_object('date', d, 'plays', c) from community_day),
      'top_regiao', (select jsonb_build_object('name', regiao, 'plays', plays) from top_regiao)
    )
  ) end;
$$;

revoke execute on function public.wrapped_for_user(uuid, int) from public, anon;
grant execute on function public.wrapped_for_user(uuid, int) to authenticated;
