import * as React from "react"

import { groupAlbums, type Album } from "@/lib/albums"
import type { Song } from "@/lib/types"

import { useSongPlayCounts } from "./useSongPlayCounts"

/**
 * The library's albums, grouped by the album tag every song carries from the
 * server's catalog, so they are complete from the first render.
 */
export function useAlbums(songs: Song[]): Album[] {
  // All-time play counts pick the cover of albums whose songs don't look
  // like the album's name.
  const playCounts = useSongPlayCounts()

  return React.useMemo(
    () => groupAlbums(songs, playCounts),
    [songs, playCounts]
  )
}
