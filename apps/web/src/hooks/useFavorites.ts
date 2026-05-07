import * as React from "react"

import { useAuth } from "./useAuth"
import { supabase } from "@/lib/supabase"

const FAVORITES_PLAYLIST_NAME = "Favorites"

/**
 * Module-scope set of favorited song ids. Backed by a special per-user
 * playlist named "Favorites" (auto-created on first heart). Stored at
 * module scope so every consumer of `useFavorites` shares the same
 * instance — toggling on a SongRow updates the heart in the fullscreen
 * player simultaneously, no prop drilling.
 */
const favoriteIds = new Set<string>()
let favoritesPlaylistId: string | null = null
let version = 0
const subscribers = new Set<() => void>()
let loadedForUserId: string | null = null

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

interface UseFavoritesResult {
  isFavorite: (songId: string) => boolean
  toggle: (songId: string) => Promise<void>
  /** True when no user is signed in or Supabase is not configured. */
  disabled: boolean
  /** ID of the underlying "Favorites" playlist, once loaded. */
  playlistId: string | null
}

/**
 * Provides reactive favorite-state for any song id, plus a `toggle`
 * action. Lazy-loads (or creates) the user's "Favorites" playlist on
 * first mount; subsequent renders read from the in-memory cache.
 *
 * Heart toggle = add/remove the song from the Favorites playlist. The
 * playlist itself behaves like any other playlist on the Playlists tab,
 * but the heart UI treats it as the canonical favorites store.
 */
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
        notify()
      }
      return
    }
    if (loadedForUserId === user.id) return
    let cancelled = false

    void (async () => {
      const sb = supabase!
      // 1. Find the user's existing "Favorites" playlist, or create one.
      const { data: existing } = await sb
        .from("playlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", FAVORITES_PLAYLIST_NAME)
        .maybeSingle()

      let id = existing?.id ?? null
      if (!id) {
        const { data: created } = await sb
          .from("playlists")
          .insert({ user_id: user.id, name: FAVORITES_PLAYLIST_NAME })
          .select("id")
          .single()
        id = created?.id ?? null
      }
      if (cancelled || !id) return

      // 2. Load the song ids currently in the Favorites playlist.
      const { data: rows } = await sb
        .from("playlist_songs")
        .select("song_id")
        .eq("playlist_id", id)

      if (cancelled) return
      favoriteIds.clear()
      for (const row of rows ?? []) favoriteIds.add(row.song_id)
      favoritesPlaylistId = id
      loadedForUserId = user.id
      notify()
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const isFavorite = React.useCallback(
    (songId: string) => favoriteIds.has(songId),
    []
  )

  const toggle = React.useCallback(
    async (songId: string) => {
      if (!supabase || !user || !favoritesPlaylistId) return
      const sb = supabase
      const playlistId = favoritesPlaylistId
      const previouslyFav = favoriteIds.has(songId)

      // Optimistic flip — UI reacts immediately.
      if (previouslyFav) favoriteIds.delete(songId)
      else favoriteIds.add(songId)
      notify()

      // Position fits in Postgres `integer` (max ~2.1B, fine until 2038).
      // Using seconds-since-epoch keeps inserts monotonic so the playlist
      // sorts most-recent-favorite-last.
      const result = previouslyFav
        ? await sb
            .from("playlist_songs")
            .delete()
            .match({ playlist_id: playlistId, song_id: songId })
        : await sb.from("playlist_songs").insert({
            playlist_id: playlistId,
            song_id: songId,
            position: Math.floor(Date.now() / 1000),
          })

      if (result.error) {
        // Rollback on failure.
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
