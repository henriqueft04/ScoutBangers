import * as React from "react"

import { fetchSongPlayCounts } from "@/lib/song-play-counts"

const NONE: ReadonlyMap<string, number> = new Map()

/** All-time play count per song id; empty until loaded (or if it can't be). */
export function useSongPlayCounts(): ReadonlyMap<string, number> {
  const [counts, setCounts] = React.useState(NONE)
  React.useEffect(() => {
    let cancelled = false
    fetchSongPlayCounts()
      .then((next) => {
        if (!cancelled) setCounts(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return counts
}
