-- Whether the user has seen the "Jam" feature tutorial (the update tour
-- shown after the main tour). Same shape as update_tour_seen (0026), which
-- tracks the song-submissions tutorial: one boolean per update tour.
alter table public.profiles
  add column if not exists jam_tour_seen boolean default false;
