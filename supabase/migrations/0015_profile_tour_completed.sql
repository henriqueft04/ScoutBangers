-- Tracks when the user finished (or skipped) the interactive tour, so
-- it doesn't auto-start on every login. Null = never seen. Setting it
-- to now() on completion / skip is enough; we don't need a separate
-- "skipped vs finished" flag — both outcomes mean "stop nagging the
-- user", and the Replay button can always re-trigger manually.

alter table public.profiles
  add column if not exists tour_completed_at timestamptz;
