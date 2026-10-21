import * as React from "react"

import {
  getAlbumTagsVersion,
  loadAlbumTags,
  subscribeToAlbumTags,
} from "@/lib/album-tags"
import { groupAlbums, type Album } from "@/lib/albums"
import { fetchChart } from "@/lib/top-songs-cache"
import type { Song } from "@/lib/types"

import { useAllMetadataVersion } from "./useAllMetadataVersion"

/**
 * The library's albums. Album names are read for every song in the
 * background, a few tens of KB each (see album-tags.ts), and remembered on
 * the device, so the row fills in quickly and is cheap even on mobile data.
 */
export function useAlbums(songs: Song[]): Album[] {
  const metadataVersion = useAllMetadataVersion()
  const tagsVersion = React.useSyncExternalStore(
    subscribeToAlbumTags,
    getAlbumTagsVersion,
    () => 0
  )

  // All-time play counts pick the cover of albums whose songs don't look
  // like the album's name. Only the edge-cached top chart is used (no extra
  // database work), so very quiet albums fall back to their first song.
  const [playCounts, setPlayCounts] = React.useState<Map<string, number>>(
    () => new Map()
  )
  React.useEffect(() => {
    let cancelled = false
    fetchChart("all")
      .then((rows) => {
        if (cancelled) return
        setPlayCounts(new Map(rows.map((r) => [r.song_id, r.play_count])))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void loadAlbumTags(songs, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [songs])

  return React.useMemo(
    () => groupAlbums(songs, playCounts),
    // Regroup as more tags land in the caches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, playCounts, metadataVersion, tagsVersion]
  )
}
