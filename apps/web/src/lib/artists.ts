import { normalizeText } from "./normalize"
import { displayArtist } from "./song-display"
import type { Song } from "./types"

/**
 * Resolve a song's artist. Embedded tag only — no filename pattern fallback.
 * Re-exported from `song-display` for symmetry with how the rest of the app
 * reads display data.
 */
export const resolveArtist = displayArtist

/**
 * Find every song whose embedded artist tag equals `name`. Comparison is
 * case- and accent-insensitive.
 */
export function songsByArtist(songs: readonly Song[], name: string): Song[] {
  const target = normalizeText(name)
  return songs.filter((song) => {
    const artist = resolveArtist(song)
    return artist ? normalizeText(artist) === target : false
  })
}

/** Build the canonical URL fragment for an artist's profile page. */
export function artistHref(name: string): string {
  return `/artist/${encodeURIComponent(name)}`
}
