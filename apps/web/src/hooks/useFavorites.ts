import * as React from "react"

import { useAuth } from "./useAuth"
import { supabase } from "@/lib/supabase"

const FAVORITES_PLAYLIST_NAME = "Favorites"

/**
 * Module-scope state. Backed by a single per-user playlist named
 * "Favorites" (auto-created on first heart). Stored at module scope so
 * every consumer of `useFavorites` shares one cache — toggling on a
 * SongRow updates the heart in the fullscreen player simultaneously.
 *
 * `loadingPromise` serialises lookup/creation across all callers; without
 * it, multiple components calling `useFavorites()` on first mount each
 * fire the effect concurrently and each create a duplicate playlist.
 */
const favoriteIds = new Set<string>()
let favoritesPlaylistId: string | null = null
let version = 0
const subscribers = new Set<() => void>()
let loadedForUserId: string | null = null
let loadingPromise: Promise<void> | null = null

function notify(): void {
  version += 1
  for (const fn of subscribers) fn()
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

async function loadFavoritesFor(userId: string): Promise<void> {
  if (!supabase) return
  const sb = supabase

  // Find ALL Favorites playlists for this user. If multiple exist (race
  // from a previous version of this hook), keep the oldest and delete
  // the rest — self-healing dedupe.
  const { data: existing } = await sb
    .from("playlists")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("name", FAVORITES_PLAYLIST_NAME)
    .order("created_at", { ascending: true })

  let id: string | null = existing?.[0]?.id ?? null

  if (existing && existing.length > 1) {
    const dupes = existing.slice(1).map((p) => p.id)
    await sb.from("playlists").delete().in("id", dupes)
  }

  if (!id) {
    const { data: created } = await sb
      .from("playlists")
      .insert({ user_id: userId, name: FAVORITES_PLAYLIST_NAME })
      .select("id")
      .single()
    id = created?.id ?? null
  }
  if (!id) return

  const { data: rows } = await sb
    .from("playlist_songs")
    .select("song_id")
    .eq("playlist_id", id)

  favoriteIds.clear()
  for (const row of rows ?? []) favoriteIds.add(row.song_id)
  favoritesPlaylistId = id
  loadedForUserId = userId
  notify()
}

interface UseFavoritesResult {
  isFavorite: (songId: string) => boolean
  toggle: (songId: string) => Promise<void>
  /** True when no user is signed in or Supabase is not configured. */
  disabled: boolean
  /** ID of the underlying "Favorites" playlist, once loaded. */
  playlistId: string | null
}

export function useFavorites(): UseFavoritesResult {
  const { user } = useAuth()

  React.useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  )

  React.useEffect(() => {
    if (!supabase || !user) {
      if (loadedForUserId !== null) {
        favoriteIds.clear()
        favoritesPlaylistId = null
        loadedForUserId = null
        loadingPromise = null
        notify()
      }
      return
    }
    if (loadedForUserId === user.id) return
    if (loadingPromise) return // already loading from another consumer

    loadingPromise = loadFavoritesFor(user.id).finally(() => {
      loadingPromise = null
    })
  }, [user])

  const isFavorite = React.useCallback(
    (songId: string) => favoriteIds.has(songId),
    []
  )

  const toggle = React.useCallback(
    async (songId: string) => {
      if (!supabase || !user) return
      const sb = supabase

      // If the playlist hasn't loaded yet, wait for it before toggling.
      if (!favoritesPlaylistId) {
        if (!loadingPromise) {
          loadingPromise = loadFavoritesFor(user.id).finally(() => {
            loadingPromise = null
          })
        }
        await loadingPromise
      }
      const playlistId = favoritesPlaylistId
      if (!playlistId) return

      const previouslyFav = favoriteIds.has(songId)

      if (previouslyFav) favoriteIds.delete(songId)
      else favoriteIds.add(songId)
      notify()

      const position = Math.floor(Date.now() / 1000)
      const result = previouslyFav
        ? await sb
            .from("playlist_songs")
            .delete()
            .match({ playlist_id: playlistId, song_id: songId })
        : await sb.from("playlist_songs").insert({
            playlist_id: playlistId,
            song_id: songId,
            position,
          })

      if (result.error) {
        if (previouslyFav) favoriteIds.add(songId)
        else favoriteIds.delete(songId)
        notify()
      }
    },
    [user]
  )

  return {
    isFavorite,
    toggle,
    disabled: !supabase || !user,
    playlistId: favoritesPlaylistId,
  }
}
