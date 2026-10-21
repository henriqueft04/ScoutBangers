-- plays_user_idx (user_id) is redundant: plays_user_song_played_idx
-- (user_id, song_id, played_at desc) where user_id is not null leads with
-- user_id, and every query filters `user_id = uid` (which implies the
-- partial predicate), so it serves the same lookups. One less index to
-- update on every play.
drop index if exists public.plays_user_idx;

-- To check the remaining plays indexes before dropping any more, run:
--
--   select indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
--   from pg_stat_user_indexes
--   where relname = 'plays'
--   order by idx_scan;
--
-- plays_song_idx, plays_artist_idx and plays_device_idx are likely unused
-- (no query filters on those columns, they are only grouped/counted), but
-- confirm idx_scan = 0 after a few days of traffic before dropping them.
