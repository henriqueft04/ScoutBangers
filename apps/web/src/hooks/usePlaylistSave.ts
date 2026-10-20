import * as React from "react"

import {
  isPlaylistSaved,
  playlistSaveCount,
  savePlaylist,
  unsavePlaylist,
} from "@/lib/playlist-saves"

import { getCached, getStaleCached, setCached } from "@/lib/storage"

import { useAuth } from "./useAuth"

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const cacheKey = (userId: string | undefined, playlistId: string) =>
  `scoutbangers:playlist-save:${userId ?? "anon"}:${playlistId}`

interface CachedSave {
  saved: boolean
  count: number
}

export interface PlaylistSaveState {
  /** True if the current user has this playlist in their saves. */
  saved: boolean
  /** Total number of users who have saved this playlist (acts as the like count). */
  count: number
  /** Toggle saved state. No-op when no playlist id, no user, or busy. */
  toggle: () => void
  /** True while a save / unsave RPC is in flight. */
  busy: boolean
  /** True until the initial load resolves. */
  loaded: boolean
}

/**
 * Reactive save / count state for a single playlist. Loads the
 * current user's saved-flag and the public save count when
 * mounted, exposes an optimistic toggle that rolls back on
 * failure.
 *
 * Pass `playlistId = undefined` for "no playlist yet" — useful
 * when the calling page is still loading the playlist meta. The
 * hook returns a no-op state in that case.
 */
export function usePlaylistSave(
  playlistId: string | undefined
): PlaylistSaveState {
  const { user } = useAuth()
  const [saved, setSaved] = React.useState(false)
  const [count, setCount] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  // Show the last known state straight away so the button doesn't flash
  // "Guardar" before flipping to "Guardada" once the network answers.
  React.useEffect(() => {
    if (!playlistId) return
    const key = cacheKey(user?.id, playlistId)
    const cached = getCached<CachedSave>(key) ?? getStaleCached<CachedSave>(key)
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached) {
      setSaved(cached.saved)
      setCount(cached.count)
      setLoaded(true)
    } else {
      setSaved(false)
      setCount(0)
      setLoaded(false)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [playlistId, user?.id])

  React.useEffect(() => {
    if (!playlistId) return
    let cancelled = false
    void Promise.all([
      playlistSaveCount(playlistId),
      user ? isPlaylistSaved(playlistId) : Promise.resolve(false),
    ]).then(([nextCount, isSaved]) => {
      if (cancelled) return
      setCount(nextCount)
      setSaved(isSaved)
      setLoaded(true)
      setCached(
        cacheKey(user?.id, playlistId),
        { saved: isSaved, count: nextCount },
        CACHE_TTL_MS
      )
    })
    return () => {
      cancelled = true
    }
  }, [playlistId, user])

  const toggle = React.useCallback(() => {
    if (!playlistId || !user || busy) return
    setBusy(true)
    const wasSaved = saved
    // Optimistic update; rollback on failure.
    setSaved(!wasSaved)
    setCount((n) => n + (wasSaved ? -1 : 1))
    setCached(
      cacheKey(user.id, playlistId),
      { saved: !wasSaved, count: Math.max(0, count + (wasSaved ? -1 : 1)) },
      CACHE_TTL_MS
    )
    const action = wasSaved
      ? unsavePlaylist(playlistId)
      : savePlaylist(playlistId)
    void action
      .catch(() => {
        setSaved(wasSaved)
        setCount((n) => n + (wasSaved ? 1 : -1))
        setCached(
          cacheKey(user.id, playlistId),
          { saved: wasSaved, count },
          CACHE_TTL_MS
        )
      })
      .finally(() => setBusy(false))
  }, [playlistId, user, busy, saved, count])

  return { saved, count, toggle, busy, loaded }
}
