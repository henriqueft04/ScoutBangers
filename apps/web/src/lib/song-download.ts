import { AUDIO_CACHE } from "./audio-cache-name"
import { sniffAudioMimeType } from "./audio-format"
import { streamUrl } from "./audio-url"

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
}

/** Characters no common file system accepts in a file name. */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g
const MAX_BASENAME_CHARS = 120

/**
 * The song's file name without its extension. `title` is the Drive file's
 * own name minus the extension, so this only guards against characters a
 * file system rejects.
 */
export function songFileBasename(title: string): string {
  const clean = title.replace(UNSAFE_FILENAME_CHARS, " ").replace(/\s+/g, " ").trim()
  return clean.slice(0, MAX_BASENAME_CHARS).trim() || "musica"
}

/**
 * The song's file, byte for byte: from the offline cache when it's there
 * (no network), otherwise from the R2 bucket, which mirrors the Drive file
 * as it is. Nothing in it is re-encoded or re-tagged. The file's own magic
 * bytes give its type, because the declared Content-Type can be wrong (see
 * audio-format); that only decides the extension of the saved file.
 */
async function fetchSong(songId: string): Promise<{ blob: Blob; extension: string }> {
  const url = streamUrl(songId)
  let response: Response | undefined
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(AUDIO_CACHE)
      response = await cache.match(url, { ignoreVary: true })
    } catch {
      /* Cache API unavailable: fall through to the network. */
    }
  }
  response ??= await fetch(url)
  if (!response.ok) {
    throw new Error(`Transferência falhou (${response.status} ${response.statusText})`)
  }
  const blob = await response.blob()
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const type = sniffAudioMimeType(head) ?? blob.type
  return { blob, extension: EXTENSIONS[type] ?? "mp3" }
}

/**
 * Saves the song's original file to the user's device through the
 * browser's own download — unlike `downloadSong`, which only stores it in
 * the app's offline cache. The `download` attribute is
 * only honoured for same-origin URLs, and audio is cross-origin, so the
 * bytes are fetched first and saved from a blob URL.
 */
export async function saveSongToDevice(songId: string, title: string): Promise<void> {
  const { blob, extension } = await fetchSong(songId)
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = `${songFileBasename(title)}.${extension}`
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking right away can cancel the save on Safari; give it a minute.
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}
