-- Whether the user has seen the "Playlists" update tour (collaborative and
-- public playlists, covers). Same shape as jam_tour_seen (0027): one
-- boolean per update tour.
alter table public.profiles
  add column if not exists playlists_tour_seen boolean default false;
