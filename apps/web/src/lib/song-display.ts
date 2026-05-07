import { peekTrackMetadata, type TrackMetadata } from "./track-metadata"
import type { Song } from "./types"

/**
 * Resolve a song's display title with a clear priority:
 *   1. embedded tag title (ID3 / MP4) — the source of truth, what was tagged
 *   2. filename title                  — fallback when tags are missing
 *   3. "Untitled"                      — last resort
 *
 * Pass `meta` if you've already read it from `useTrackMetadata` to avoid a
 * second cache lookup.
 */
export function displayTitle(
  song: Song,
  meta?: TrackMetadata | null
): string {
  void meta
  return song.title || "Untitled"
}

/**
 * Resolve a song's display artist. Only the embedded tag artist is used —
 * filename pattern parsing is unreliable so we deliberately ignore it.
 * Returns `undefined` when the song has no embedded artist tag, in which
 * case callers should render no artist line at all (per product decision).
 */
export function displayArtist(
  song: Song,
  meta?: TrackMetadata | null
): string | undefined {
  const m = meta ?? peekTrackMetadata(song.id)
  return m?.artist || undefined
}
