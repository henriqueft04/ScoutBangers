import * as React from "react"

import {
  ensureTrackMetadata,
  peekTrackMetadata,
  subscribeToMetadata,
  type TrackMetadata,
} from "@/lib/track-metadata"

const NULL_SUBSCRIBE = () => () => undefined
const NULL_SNAPSHOT = (): TrackMetadata | null => null

/**
 * Lazily reads embedded tags (artist, album art, …) for a song. The fetch is
 * deferred until `enabled` flips to `true` — typical use is pairing with an
 * IntersectionObserver so off-screen rows don't trigger a request.
 *
 * Reads are cache-backed via `useSyncExternalStore`, so multiple components
 * asking for the same song share one network call and one in-memory entry.
 */
export function useTrackMetadata(
  songId: string | undefined,
  enabled = true
): TrackMetadata | null {
  const subscribe = React.useMemo(() => {
    if (!songId) return NULL_SUBSCRIBE
    return (cb: () => void) => subscribeToMetadata(songId, cb)
  }, [songId])

  const getSnapshot = React.useMemo(() => {
    if (!songId) return NULL_SNAPSHOT
    return () => peekTrackMetadata(songId) ?? null
  }, [songId])

  const meta = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    NULL_SNAPSHOT
  )

  React.useEffect(() => {
    if (!songId || !enabled) return
    void ensureTrackMetadata(songId)
  }, [songId, enabled])

  return meta
}
