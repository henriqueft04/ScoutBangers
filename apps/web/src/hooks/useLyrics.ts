import * as React from "react"

import { getLyricsFor, subscribeToLyrics } from "@/lib/lyrics"

/**
 * Read the lyrics for a song by display title. Re-renders when the
 * background lyrics cache updates (e.g. after a 24 h refresh that
 * fills in a previously-missing song).
 */
export function useLyrics(title: string | undefined): string | undefined {
  const subscribe = React.useCallback(
    (callback: () => void) => subscribeToLyrics(callback),
    []
  )
  const getSnapshot = React.useCallback(
    () => (title ? getLyricsFor(title) : undefined),
    [title]
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
