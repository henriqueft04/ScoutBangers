-- Backfill duration_seconds on plays. Migration 0020 added the column
-- without backfilling, so every play recorded before it — plus any play
-- whose file metadata hadn't parsed by the 30-second mark, or whose
-- file carries no duration tag — sits at NULL and contributes zero to
-- the listening-time stats (stats_for_user / stats_summary both do
-- sum(duration_seconds)) while still counting as a play.
--
-- Source of truth: other plays of the same song that DID record a
-- duration. Per song we take the most frequently recorded value, so a
-- lone bad estimate can't outvote many exact tag durations.
--
-- Idempotent — safe to re-run. Worth re-running once the client-side
-- fallback (player duration estimate) has been live for a while, since
-- songs with no duration tag only start producing known durations then.

with known as (
  select distinct on (song_id)
    song_id,
    duration_seconds
  from public.plays
  where duration_seconds is not null
  group by song_id, duration_seconds
  order by song_id, count(*) desc, duration_seconds desc
)
update public.plays p
set duration_seconds = known.duration_seconds
from known
where p.duration_seconds is null
  and p.song_id = known.song_id;
