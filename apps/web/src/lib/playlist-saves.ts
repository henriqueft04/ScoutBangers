import { supabase } from "./supabase"

/**
 * Save / unsave a public playlist for the current user, plus read
 * helpers for the public save count and the current user's list of
 * saved playlists. The same `playlist_saves` row doubles as a "like"
 * — saveCount() drives the public counter shown on every public
 * playlist.
 *
 * RLS guarantees:
 *   - Anyone can read playlist_saves (counts are public).
 *   - A user can only insert a row that:
 *       * has their own user_id, AND
 *       * references a public playlist, AND
 *       * isn't their own playlist.
 *   - A user can only delete their own rows.
 */

export interface SavedPlaylistSummary {
  id: string
  name: string
  ownerId: string
  ownerDisplayName: string
  songCount: number
  savedAt: string
  saveCount: number
  coverUrl: string | null
  previewSongIds: string[]
}

export async function savePlaylist(playlistId: string): Promise<void> {
  if (!supabase) return
  const { data: session } = await supabase.auth.getSession()
  const user = session.session?.user
  if (!user) return
  await supabase
    .from("playlist_saves")
    .insert({ user_id: user.id, playlist_id: playlistId })
}

export async function unsavePlaylist(playlistId: string): Promise<void> {
  if (!supabase) return
  const { data: session } = await supabase.auth.getSession()
  const user = session.session?.user
  if (!user) return
  await supabase
    .from("playlist_saves")
    .delete()
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
}

export async function isPlaylistSaved(
  playlistId: string
): Promise<boolean> {
  if (!supabase) return false
  const { data: session } = await supabase.auth.getSession()
  const user = session.session?.user
  if (!user) return false
  const { data } = await supabase
    .from("playlist_saves")
    .select("playlist_id")
    .eq("user_id", user.id)
    .eq("playlist_id", playlistId)
    .maybeSingle()
  return Boolean(data)
}

export async function playlistSaveCount(
  playlistId: string
): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc("playlist_save_count", {
    pid: playlistId,
  })
  if (error || typeof data !== "number") return 0
  return data
}

export async function listSavedPlaylists(
  userId: string
): Promise<SavedPlaylistSummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc("saved_playlists_for_user", {
    uid: userId,
  })
  if (error || !data) return []
  return (data as Array<{
    id: string
    name: string
    owner_id: string
    owner_display_name: string
    song_count: number
    saved_at: string
    save_count: number
    cover_url: string | null
    preview_song_ids: string[] | null
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ownerDisplayName: row.owner_display_name,
    songCount: row.song_count,
    savedAt: row.saved_at,
    saveCount: row.save_count ?? 0,
    coverUrl: row.cover_url ?? null,
    previewSongIds: row.preview_song_ids ?? [],
  }))
}

export interface MyPlaylistOverview {
  id: string
  name: string
  isPublic: boolean
  createdAt: string
  songCount: number
  saveCount: number
  coverUrl: string | null
  previewSongIds: string[]
}

/** Returns `null` on failure so callers can keep showing cached data. */
export async function myPlaylistsOverview(
  userId: string
): Promise<MyPlaylistOverview[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("my_playlists_overview", {
    uid: userId,
  })
  if (error || !data) return null
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    isPublic: row.is_public,
    createdAt: row.created_at,
    songCount: row.song_count,
    saveCount: row.save_count,
    coverUrl: row.cover_url ?? null,
    previewSongIds: row.preview_song_ids ?? [],
  }))
}

export interface DiscoverPlaylist {
  id: string
  name: string
  ownerId: string
  ownerDisplayName: string
  songCount: number
  saveCount: number
  coverUrl: string | null
  previewSongIds: string[]
}

export type DiscoverSort = "saves" | "recent"

export const DISCOVER_PAGE_SIZE = 20

/** Returns `null` on failure. */
export async function discoverPlaylists(opts: {
  q: string
  sort: DiscoverSort
  page: number
}): Promise<DiscoverPlaylist[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc("discover_public_playlists", {
    q: opts.q.trim(),
    sort: opts.sort,
    lim: DISCOVER_PAGE_SIZE,
    off: opts.page * DISCOVER_PAGE_SIZE,
  })
  if (error || !data) return null
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ownerDisplayName: row.owner_display_name,
    songCount: row.song_count,
    saveCount: row.save_count,
    coverUrl: row.cover_url ?? null,
    previewSongIds: row.preview_song_ids ?? [],
  }))
}
