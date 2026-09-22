-- Add a table for user-submitted lyrics suggestions.

create table if not exists public.lyrics_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  song_id text not null,
  title text not null,
  lyrics text not null,
  created_at timestamptz not null default now()
);

drop policy if exists lyrics_submissions_insert on public.lyrics_submissions;
create policy lyrics_submissions_insert on public.lyrics_submissions
  for insert with check (
    auth.uid() is null
    or auth.uid() = user_id
  );
