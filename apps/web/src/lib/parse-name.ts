/**
 * Split a Drive filename into `{ artist, title }`. Recognised shapes:
 *
 *   "Artist - Title.mp3"       → { artist: "Artist", title: "Title" }
 *   "Artist – Title.mp3"       → en-dash variant
 *   "Title.mp3"                → { title: "Title" }   (artist undefined)
 *
 * The file extension is always stripped. Title and artist are trimmed.
 */
export function parseSongName(filename: string): {
  title: string
  artist?: string
} {
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, "")
  const match = withoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (match) {
    return { artist: match[1]!.trim(), title: match[2]!.trim() }
  }
  return { title: withoutExt.trim() }
}
