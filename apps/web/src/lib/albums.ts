import { peekAlbumTag } from "./album-tags"
import { normalizeText } from "./normalize"
import { displayTitle } from "./song-display"
import { peekTrackMetadata } from "./track-metadata"
import type { Song } from "./types"

export interface Album {
  /** Accent- and case-insensitive identity of the album name. */
  key: string
  name: string
  songs: Song[]
  /** Song whose artwork stands for the album. */
  cover: Song
}

/** A lone song isn't worth an album card. */
const MIN_SONGS = 2

/** How alike a title and the album name must be to count as a match. */
const TITLE_MATCH_THRESHOLD = 0.5

const words = (text: string) =>
  new Set(
    normalizeText(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  )

/**
 * 0–1 resemblance of two names: 1 when identical, 0.9 when one contains the
 * other, otherwise the overlap of their words (Dice coefficient).
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeText(a).trim()
  const y = normalizeText(b).trim()
  if (!x || !y) return 0
  if (x === y) return 1
  // Very short names would be "contained" in almost anything.
  if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) {
    return 0.9
  }
  const wordsA = words(a)
  const wordsB = words(b)
  let shared = 0
  for (const word of wordsA) if (wordsB.has(word)) shared++
  return (2 * shared) / (wordsA.size + wordsB.size || 1)
}

/**
 * Which song's artwork represents an album: the one whose title looks most
 * like the album's name; with no good match, the most played one; with no
 * plays known either, the first. (Songs of an album share their cover, so
 * which one is read doesn't matter beyond that.)
 */
export function pickCoverSong(
  name: string,
  songs: readonly Song[],
  playCounts: ReadonlyMap<string, number>
): Song {
  const pool = songs

  let best = pool[0]!
  let bestScore = 0
  for (const song of pool) {
    const score = nameSimilarity(displayTitle(song), name)
    if (score > bestScore) {
      best = song
      bestScore = score
    }
  }
  if (bestScore >= TITLE_MATCH_THRESHOLD) return best

  let mostPlayed = pool[0]!
  let mostPlays = 0
  for (const song of pool) {
    const plays = playCounts.get(song.id) ?? 0
    if (plays > mostPlays) {
      mostPlayed = song
      mostPlays = plays
    }
  }
  return mostPlayed
}

/**
 * Groups songs by the album tag of their embedded metadata. Only songs whose
 * tags are already loaded can be placed, so the result grows as tags arrive.
 * Biggest albums first.
 */
export function groupAlbums(
  songs: readonly Song[],
  playCounts: ReadonlyMap<string, number> = new Map()
): Album[] {
  const groups = new Map<string, { name: string; songs: Song[] }>()
  for (const song of songs) {
    const name = peekTrackMetadata(song.id)?.album?.trim() || peekAlbumTag(song)
    if (!name) continue
    const key = normalizeText(name)
    const group = groups.get(key) ?? { name, songs: [] }
    group.songs.push(song)
    groups.set(key, group)
  }
  const collator = new Intl.Collator(undefined, { sensitivity: "base" })
  return [...groups.entries()]
    .filter(([, group]) => group.songs.length >= MIN_SONGS)
    .map(([key, group]) => ({
      key,
      name: group.name,
      songs: group.songs,
      cover: pickCoverSong(group.name, group.songs, playCounts),
    }))
    .sort(
      (a, b) =>
        b.songs.length - a.songs.length || collator.compare(a.name, b.name)
    )
}
