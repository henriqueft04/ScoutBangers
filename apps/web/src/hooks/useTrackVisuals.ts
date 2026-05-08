import * as React from "react"

import type { TrackMetadata } from "@/lib/track-metadata"

import { useInView } from "./useInView"
import { useTrackMetadata } from "./useTrackMetadata"

interface UseTrackVisualsResult<E extends Element = HTMLElement> {
  ref: React.RefObject<E | null>
  meta: TrackMetadata | null
  inView: boolean
}

/**
 * One-stop visual setup for a track row: an in-view sentinel ref plus
 * the embedded metadata fetched lazily once the row is visible.
 *
 * Replaces the `const [ref, inView] = useInView(); const meta =
 * useTrackMetadata(songId, inView)` pair that was duplicated across
 * SongRow, QueueRow, UpcomingRow, and the friends feed.
 *
 * Pass `modifiedTime` so the cache self-invalidates when a song is
 * re-uploaded — see useTrackMetadata.
 */
export function useTrackVisuals<E extends Element = HTMLElement>(
  songId: string | undefined,
  enabled: boolean = true,
  modifiedTime?: string
): UseTrackVisualsResult<E> {
  const [ref, inView] = useInView<E>()
  const meta = useTrackMetadata(
    songId,
    enabled && inView && Boolean(songId),
    modifiedTime
  )
  return { ref, meta, inView }
}
