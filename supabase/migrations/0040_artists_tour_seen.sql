-- Whether the user has seen the "Albums + artist pages" update tour. Same
-- shape as playlists_tour_seen (0036): one boolean per update tour.
alter table public.profiles
  add column if not exists artists_tour_seen boolean default false;
