-- Optional custom cover image for a playlist (uploaded through
-- /api/avatar?kind=playlist). When null the app builds a mosaic from the
-- playlist's songs.
alter table public.playlists add column if not exists cover_url text;
