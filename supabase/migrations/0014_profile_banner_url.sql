-- Adds a banner_url column to profiles so users can pick their own
-- profile cover image. Stored as a URL pointing at the R2 banner
-- bucket; null means "show the default placeholder".

alter table public.profiles
  add column if not exists banner_url text;
