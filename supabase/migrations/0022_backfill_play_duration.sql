-- Security-definer RPC so any authenticated user can write duration_seconds
-- to plays rows they don't own. Used for the one-time client-side backfill
-- that reads durations from audio file tags and patches NULL rows.
create or replace function public.backfill_play_duration(
  p_song_id        text,
  p_duration_seconds integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.plays
  set    duration_seconds = p_duration_seconds
  where  song_id          = p_song_id
    and  duration_seconds is null;
$$;

grant execute on function public.backfill_play_duration(text, integer) to authenticated;
