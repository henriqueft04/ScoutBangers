import * as React from "react"

import { usePlayer } from "./usePlayer"
import type { Song } from "@/lib/types"

/**
 * Convenience wrapper around `play()` for tab pages. Computes the
 * canonical `songs.findIndex(...)` and `contextSongs.map(s => s.id)`
 * dance so tabs only have to write
 *
 *   playFromList(song, visibleSongs)
 *
 * instead of the four-line repetition that was scattered across
 * Library, Artist, Playlist and Home pages.
 */
export function usePlayFromList(): (song: Song, contextSongs: Song[]) => void {
  const { songs, play } = usePlayer()
  return React.useCallback(
    (song: Song, contextSongs: Song[]) => {
      const index = songs.findIndex((s) => s.id === song.id)
      if (index === -1) return
      play(
        index,
        contextSongs.map((s) => s.id)
      )
    },
    [songs, play]
  )
}
