-- Playlist collaborators. The owner invites someone; the invitee accepts or
-- declines. An accepted collaborator can add/remove songs and change the
-- name and cover; only the owner can delete the playlist, flip it public or
-- private, and manage collaborators. "Favorites" can't have collaborators.
--
-- Invites, accepts and declines go through the security-definer functions
-- below, so the table itself has no insert/update policy: a client can only
-- read its own rows and delete rows it may remove.

create table if not exists public.playlist_collaborators (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create index if not exists playlist_collaborators_user_idx
  on public.playlist_collaborators (user_id);

alter table public.playlist_collaborators enable row level security;

-- ===== helpers ====================================================
-- Security definer so policies can call them without recursing through RLS.

create or replace function public.is_playlist_owner(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = pid and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_playlist_editor(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = pid
      and (
        p.user_id = auth.uid()
        or exists (
          select 1 from public.playlist_collaborators c
          where c.playlist_id = p.id
            and c.user_id = auth.uid()
            and c.status = 'accepted'
        )
      )
  );
$$;

grant execute on function public.is_playlist_owner(uuid) to authenticated;
grant execute on function public.is_playlist_editor(uuid) to authenticated;

-- ===== playlist_collaborators policies ============================

drop policy if exists "collaborators_read" on public.playlist_collaborators;
create policy "collaborators_read" on public.playlist_collaborators
  for select using (
    user_id = auth.uid() or public.is_playlist_owner(playlist_id)
  );

-- Owner removes/cancels; the invitee declines or leaves.
drop policy if exists "collaborators_delete" on public.playlist_collaborators;
create policy "collaborators_delete" on public.playlist_collaborators
  for delete using (
    user_id = auth.uid() or public.is_playlist_owner(playlist_id)
  );

-- ===== playlists / playlist_songs policies =========================

drop policy if exists "playlists_read_collaborator" on public.playlists;
create policy "playlists_read_collaborator" on public.playlists
  for select using (public.is_playlist_editor(id));

drop policy if exists "playlists_update_own" on public.playlists;
drop policy if exists "playlists_update_editor" on public.playlists;
create policy "playlists_update_editor" on public.playlists
  for update
  using (public.is_playlist_editor(id))
  with check (public.is_playlist_editor(id));

-- RLS can't limit columns, so collaborators are kept off the owner-only ones
-- here. Nobody may reassign a playlist; only the owner may change visibility.
-- (auth.uid() is null in the SQL editor / service role, which stays unrestricted.)
create or replace function public.guard_playlist_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'Cannot change the owner of a playlist';
    end if;
    if new.is_public is distinct from old.is_public
       and auth.uid() is distinct from old.user_id then
      raise exception 'Only the owner can change playlist visibility';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_playlist_update on public.playlists;
create trigger guard_playlist_update
  before update on public.playlists
  for each row execute function public.guard_playlist_update();

drop policy if exists "playlist_songs_read_editor" on public.playlist_songs;
create policy "playlist_songs_read_editor" on public.playlist_songs
  for select using (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_insert_own" on public.playlist_songs;
drop policy if exists "playlist_songs_insert_editor" on public.playlist_songs;
create policy "playlist_songs_insert_editor" on public.playlist_songs
  for insert with check (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_update_own" on public.playlist_songs;
drop policy if exists "playlist_songs_update_editor" on public.playlist_songs;
create policy "playlist_songs_update_editor" on public.playlist_songs
  for update
  using (public.is_playlist_editor(playlist_id))
  with check (public.is_playlist_editor(playlist_id));

drop policy if exists "playlist_songs_delete_own" on public.playlist_songs;
drop policy if exists "playlist_songs_delete_editor" on public.playlist_songs;
create policy "playlist_songs_delete_editor" on public.playlist_songs
  for delete using (public.is_playlist_editor(playlist_id));

-- ===== RPCs =======================================================

create or replace function public.invite_playlist_collaborator(pid uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_playlist_owner(pid) then
    raise exception 'Only the owner can invite collaborators';
  end if;
  if uid = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;
  if exists (select 1 from public.playlists where id = pid and name = 'Favorites') then
    raise exception 'Favorites cannot have collaborators';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Unknown user';
  end if;
  insert into public.playlist_collaborators (playlist_id, user_id, invited_by)
  values (pid, uid, auth.uid())
  on conflict (playlist_id, user_id) do nothing;
end;
$$;

grant execute on function public.invite_playlist_collaborator(uuid, uuid) to authenticated;

-- Owner sees pending invites too; everyone else only accepted collaborators.
create or replace function public.playlist_collaborators_list(pid uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id, coalesce(prof.display_name, '') as display_name, prof.avatar_url, c.status
  from public.playlist_collaborators c
  join public.playlists p on p.id = c.playlist_id
  left join public.profiles prof on prof.id = c.user_id
  where c.playlist_id = pid
    and (
      c.status = 'accepted'
      or p.user_id = auth.uid()
      or c.user_id = auth.uid()
    )
    and (
      p.is_public = true
      or public.is_playlist_editor(pid)
      or c.user_id = auth.uid()
    )
  order by c.created_at;
$$;

grant execute on function public.playlist_collaborators_list(uuid) to anon, authenticated;

create or replace function public.my_playlist_invites()
returns table (
  playlist_id uuid,
  playlist_name text,
  inviter_id uuid,
  inviter_name text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.playlist_id,
    p.name as playlist_name,
    c.invited_by as inviter_id,
    coalesce(prof.display_name, '') as inviter_name,
    c.created_at as invited_at
  from public.playlist_collaborators c
  join public.playlists p on p.id = c.playlist_id
  left join public.profiles prof on prof.id = c.invited_by
  where c.user_id = auth.uid()
    and c.status = 'pending'
  order by c.created_at desc;
$$;

grant execute on function public.my_playlist_invites() to authenticated;

create or replace function public.respond_playlist_invite(pid uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if accept then
    update public.playlist_collaborators
    set status = 'accepted'
    where playlist_id = pid and user_id = auth.uid() and status = 'pending';
  else
    delete from public.playlist_collaborators
    where playlist_id = pid and user_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

grant execute on function public.respond_playlist_invite(uuid, boolean) to authenticated;

-- The user's own playlists plus the ones they collaborate on.
drop function if exists public.my_playlists_overview(uuid);
create function public.my_playlists_overview(uid uuid)
returns table (
  id uuid,
  name text,
  is_public boolean,
  created_at timestamptz,
  song_count int,
  save_count int,
  cover_url text,
  preview_song_ids text[],
  owner_id uuid,
  owner_display_name text,
  is_collaborator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_public,
    p.created_at,
    (select count(*) from public.playlist_songs ps where ps.playlist_id = p.id)::int as song_count,
    (select count(*) from public.playlist_saves s where s.playlist_id = p.id)::int as save_count,
    p.cover_url,
    coalesce((
      select array_agg(x.song_id order by x.position)
      from (
        select ps.song_id, ps.position
        from public.playlist_songs ps
        where ps.playlist_id = p.id
        order by ps.position
        limit 16
      ) x
    ), '{}'::text[]) as preview_song_ids,
    p.user_id as owner_id,
    coalesce(prof.display_name, '') as owner_display_name,
    (p.user_id <> uid) as is_collaborator
  from public.playlists p
  left join public.profiles prof on prof.id = p.user_id
  where uid = auth.uid()
    and (
      p.user_id = uid
      or exists (
        select 1 from public.playlist_collaborators c
        where c.playlist_id = p.id and c.user_id = uid and c.status = 'accepted'
      )
    )
  order by p.created_at desc;
$$;

grant execute on function public.my_playlists_overview(uuid) to authenticated;
