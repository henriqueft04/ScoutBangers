-- ScoutBangers v3 — security hardening migration
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.

-- ===== 1. Dedupe + prevent duplicate Favorites playlists =========
-- The original useFavorites hook had a race that could create multiple
-- "Favorites" playlists per user. The client now self-heals, but a
-- partial unique index makes it impossible at the DB level.

-- First, remove any leftover duplicates (keep oldest per user).
delete from public.playlists
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id
        order by created_at asc
      ) as rn
    from public.playlists
    where name = 'Favorites'
  ) ranked
  where rn > 1
);

-- Then enforce uniqueness on Favorites name per user. Partial index so
-- other playlist names can still have duplicates if the user wants
-- (e.g. two playlists called "Workout").
create unique index if not exists playlists_one_favorites_per_user
  on public.playlists (user_id)
  where name = 'Favorites';

-- ===== 2. Rate-limit plays inserts to 1 per (user, song) per minute =====
-- Prevents authenticated users from spamming `INSERT plays` to inflate
-- the global top-10. Anonymous plays are unaffected (anonymous traffic
-- is gated by Vercel bandwidth and the stream-proxy file allowlist).

-- Index the rate-limit check so it stays fast as plays grows.
create index if not exists plays_user_song_played_idx
  on public.plays (user_id, song_id, played_at desc)
  where user_id is not null;

drop policy if exists "plays_insert_self_or_anon" on public.plays;

create policy "plays_insert_self_or_anon" on public.plays
  for insert
  with check (
    user_id is null
    or (
      auth.uid() = user_id
      and not exists (
        select 1 from public.plays existing
        where existing.user_id = plays.user_id
          and existing.song_id = plays.song_id
          and existing.played_at > now() - interval '60 seconds'
      )
    )
  );
