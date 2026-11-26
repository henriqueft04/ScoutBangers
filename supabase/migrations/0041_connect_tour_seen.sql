-- Whether the user has seen the "Connect" update tour (play on another of
-- your devices, control it from this one). Same shape as artists_tour_seen
-- (0040): one boolean per update tour.
alter table public.profiles
  add column if not exists connect_tour_seen boolean default false;
