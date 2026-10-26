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
export function displayTitle(song: Song, meta?: TrackMetadata | null): string {
  void meta
  return song.title || "Sem título"
}

/**
 * Resolve a song's display artist. Only the tag artist is used — filename
 * pattern parsing is unreliable so we deliberately ignore it. The server
 * catalog's value wins (it follows edits); a song not in it falls back to its
 * own loaded tags. Returns `undefined` when the song has no artist tag, in
 * which case callers should render no artist line at all (per product
 * decision).
 */
export function displayArtist(
  song: Song,
  meta?: TrackMetadata | null
): string | undefined {
  const m = meta ?? peekTrackMetadata(song.id)
  return (song.artist ?? m?.artist) || undefined
}

/**
 * A song's album: the server catalog's, which is complete from the start and
 * follows edits; the song's own loaded tags only for a song not in it.
 */
export function displayAlbum(
  song: Song,
  meta?: TrackMetadata | null
): string | undefined {
  const m = meta ?? peekTrackMetadata(song.id)
  return (song.album ?? m?.album) || undefined
}
