-- Artist banners. Anyone signed in can suggest a banner image for an artist;
-- an admin approves it, and the approved banner then shows on the artist's
-- page (artists with none get a mosaic of their songs' covers, like
-- playlists). Artists are not rows anywhere: a banner is attached to the
-- accent- and case-insensitive form of the artist's name (`artist_key`), which
-- the approve function computes with the same code the app uses to compare
-- names, from the name the admin saw.
--
-- The images live in the image bucket (R2); only their URLs are stored here.
-- Uploading and approving go through Pages functions (functions/api/
-- artist-banners/), which write to the bucket.

-- The banner currently shown for an artist. Public to read; only admins write
-- (the approve function does so with the admin's own token).
create table if not exists public.artist_banners (
  artist_key text primary key,
  artist_name text not null,
  banner_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.artist_banners enable row level security;

drop policy if exists "artist_banners_read" on public.artist_banners;
create policy "artist_banners_read" on public.artist_banners
  for select using (true);

drop policy if exists "artist_banners_admin_write" on public.artist_banners;
create policy "artist_banners_admin_write" on public.artist_banners
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Suggestions waiting for (or already given) a decision.
create table if not exists public.artist_banner_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists artist_banner_submissions_status_idx
  on public.artist_banner_submissions (status, created_at);

alter table public.artist_banner_submissions enable row level security;

-- No insert policy: suggestions are created by submit_artist_banner() below,
-- which enforces the limits.
drop policy if exists "artist_banner_submissions_read_own" on public.artist_banner_submissions;
create policy "artist_banner_submissions_read_own" on public.artist_banner_submissions
  for select using (user_id = auth.uid());

drop policy if exists "artist_banner_submissions_admin_read" on public.artist_banner_submissions;
create policy "artist_banner_submissions_admin_read" on public.artist_banner_submissions
  for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "artist_banner_submissions_admin_update" on public.artist_banner_submissions;
create policy "artist_banner_submissions_admin_update" on public.artist_banner_submissions
  for update using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Starts a suggestion and returns its id; the image is uploaded against that
-- id afterwards. A user may have 3 suggestions waiting and make 10 a day.
create or replace function public.submit_artist_banner(artist_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  name_clean text := btrim(coalesce(artist_name, ''));
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to suggest a banner';
  end if;
  if name_clean = '' or length(name_clean) > 200 then
    raise exception 'Invalid artist name';
  end if;

  -- Each suggestion is uploaded once and never changed afterwards (so an
  -- admin approves exactly what they looked at). Suggesting again for the
  -- same artist therefore supersedes the earlier waiting one with a new id.
  update public.artist_banner_submissions
  set status = 'rejected'
  where user_id = auth.uid()
    and lower(artist_name) = lower(name_clean)
    and status = 'pending';

  if (
    select count(*) from public.artist_banner_submissions
    where user_id = auth.uid() and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Too many suggestions today';
  end if;
  if (
    select count(*) from public.artist_banner_submissions
    where user_id = auth.uid() and status = 'pending'
  ) >= 3 then
    raise exception 'Too many suggestions waiting for approval';
  end if;

  insert into public.artist_banner_submissions (user_id, artist_name)
  values (auth.uid(), name_clean)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.submit_artist_banner(text) to authenticated;
