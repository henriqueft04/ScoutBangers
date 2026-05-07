import * as React from "react"

import { normalizeText } from "@/lib/normalize"
import { displayArtist, displayTitle } from "@/lib/song-display"
import { peekTrackMetadata } from "@/lib/track-metadata"
import type { Song } from "@/lib/types"

import { useAllMetadataVersion } from "./useAllMetadataVersion"

/**
 * Filters `songs` by a case- and accent-insensitive substring match across
 * the song's display title (ID3 → filename), display artist (ID3 only), and
 * album.
 *
 * Re-runs when:
 *   - the songs array changes
 *   - the query changes
 *   - any song's metadata lands in the cache (so songs become searchable as
 *     their tags arrive in the background)
 */
export function useFilteredSongs(songs: Song[], query: string): Song[] {
  const metadataVersion = useAllMetadataVersion()

  return React.useMemo(() => {
    const needle = normalizeText(query.trim())
    if (!needle) return songs

    return songs.filter((song) => {
      const meta = peekTrackMetadata(song.id)
      const haystack = normalizeText(
        [displayTitle(song, meta), displayArtist(song, meta), meta?.album]
          .filter(Boolean)
          .join(" ")
      )
      return haystack.includes(needle)
    })
    // metadataVersion intentionally part of deps so we re-filter on cache fills.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, query, metadataVersion])
}
