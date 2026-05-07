import * as React from "react"

import type { Song } from "@/lib/types"

/**
 * Filters `songs` by a case-insensitive substring match on title and artist.
 * Memoised on `(songs, query)`.
 */
export function useFilteredSongs(songs: Song[], query: string): Song[] {
  return React.useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return songs
    return songs.filter((song) => {
      const haystack = `${song.title} ${song.artist ?? ""}`.toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [songs, query])
}
