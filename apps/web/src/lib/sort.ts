import { displayArtist, displayTitle } from "./song-display"
import type { Song } from "./types"

export type SortMode = "default" | "title" | "artist"

/**
 * When a song was added to the catalog. Falls back to `modifiedTime` for a
 * manifest cached before `createdTime` existed, so the newest-first order
 * degrades to "recently touched" instead of breaking.
 */
export function addedAt(song: Song): string {
  return song.createdTime ?? song.modifiedTime
}

/** A copy of `songs`, most recently added first. */
export function newestFirst(songs: readonly Song[]): Song[] {
  // ISO-8601 timestamps sort chronologically as plain strings.
  return [...songs].sort((a, b) => {
    const aAt = addedAt(a)
    const bAt = addedAt(b)
    return aAt < bAt ? 1 : aAt > bAt ? -1 : 0
  })
}

export const SORT_LABEL: Record<SortMode, string> = {
  default: "Predefinido",
  title: "Título A–Z",
  artist: "Artista A–Z",
}

/**
 * Sort a copy of `songs` by the chosen mode. `default` is identity (preserves
 * server-supplied order). Title and artist sorts use locale-aware compare and
 * fall back to ID3-derived metadata when the filename doesn't expose an
 * artist.
 */
export function sortSongs(songs: readonly Song[], mode: SortMode): Song[] {
  if (mode === "default") return [...songs]

  const collator = new Intl.Collator(undefined, {
    sensitivity: "base",
    numeric: true,
  })

  return [...songs].sort((a, b) => {
    if (mode === "title") {
      return collator.compare(displayTitle(a), displayTitle(b))
    }
    // artist — songs with no embedded artist sort to the end (sentinel).
    const aArtist = displayArtist(a) ?? "￿"
    const bArtist = displayArtist(b) ?? "￿"
    const byArtist = collator.compare(aArtist, bArtist)
    if (byArtist !== 0) return byArtist
    return collator.compare(displayTitle(a), displayTitle(b))
  })
}
