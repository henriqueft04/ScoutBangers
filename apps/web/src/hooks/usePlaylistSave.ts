import * as React from "react"

import {
  isPlaylistSaved,
  playlistSaveCount,
  savePlaylist,
  unsavePlaylist,
} from "@/lib/playlist-saves"

import { useAuth } from "./useAuth"

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
    const action = wasSaved
      ? unsavePlaylist(playlistId)
      : savePlaylist(playlistId)
    void action
      .catch(() => {
        setSaved(wasSaved)
        setCount((n) => n + (wasSaved ? 1 : -1))
      })
      .finally(() => setBusy(false))
  }, [playlistId, user, busy, saved])

  return { saved, count, toggle, busy, loaded }
}
