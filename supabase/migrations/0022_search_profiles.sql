-- ScoutBangers — accent-insensitive profile search.
--
-- Lets the Friends search match names regardless of diacritics (´ ` ~ ^ ç),
-- so "joao" finds "João" and "antonio" finds "António". Postgres `ilike` is
-- accent-sensitive, so we normalise both sides with `unaccent`.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_profiles(q text, lim int default 12)
returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.display_name is not null
    -- Escape LIKE wildcards in the query so a literal % or _ matches itself.
    and extensions.unaccent(p.display_name)
        ilike '%' || replace(replace(replace(extensions.unaccent(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.display_name asc
  limit lim;
$$;

grant execute on function public.search_profiles(text, int) to anon, authenticated;
