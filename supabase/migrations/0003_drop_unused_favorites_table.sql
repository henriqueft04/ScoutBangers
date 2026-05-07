-- Drop the unused `favorites` table.
-- v3 originally had a separate favorites table; we ended up using a
-- per-user "Favorites" playlist instead, leaving the table empty.

drop table if exists public.favorites;
