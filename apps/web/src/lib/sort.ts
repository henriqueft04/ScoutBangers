import { displayArtist, displayTitle } from "./song-display"
import type { Song } from "./types"

export type SortMode = "default" | "title" | "artist"

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
