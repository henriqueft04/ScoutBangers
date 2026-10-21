import { streamUrl } from "./audio-url"
import { getStaleCached, setCached } from "./storage"
import type { Song } from "./types"

/**
 * Album names, read cheaply. Grouping the library into albums needs every
 * song's album tag, but the normal metadata read (track-metadata.ts) downloads
 * up to 2 MB per song for the cover art. The album name is a few bytes inside
 * the ID3v2 tag at the start of the file, so this walks the tag's frame
 * headers with small Range requests and jumps over the big cover frame.
 * That costs a few tens of KB per song instead of megabytes.
 */

const STORE_KEY = "scoutbangers:album-tags-v1"
const STORE_TTL_MS = 365 * 24 * 60 * 60 * 1000

/** Bytes per request while walking a tag. */
const WINDOW_BYTES = 16 * 1024
/** Album names are short; anything bigger isn't one. */
const MAX_FRAME_BYTES = 2048
/** Parallel readers; each request is tiny. */
const CONCURRENCY = 3
const NOTIFY_DELAY_MS = 300

/** `album` is null when the file was read and has none. */
interface Entry {
  album: string | null
  /** The song's modifiedTime when read, so a re-uploaded file is read again. */
  at: string
}

const entries = new Map<string, Entry>(
  Object.entries(getStaleCached<Record<string, Entry>>(STORE_KEY) ?? {})
)
const inflight = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
let notifyTimer: ReturnType<typeof setTimeout> | undefined

function persist() {
  setCached(STORE_KEY, Object.fromEntries(entries), STORE_TTL_MS)
}

function notifySoon() {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = undefined
    version += 1
    persist()
    listeners.forEach((listener) => listener())
  }, NOTIFY_DELAY_MS)
}

export function subscribeToAlbumTags(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAlbumTagsVersion(): number {
  return version
}

/**
 * The song's album: a name, null when its file has none, or undefined when it
 * hasn't been read yet.
 */
export function peekAlbumTag(song: Song): string | null | undefined {
  const entry = entries.get(song.id)
  return entry && entry.at === song.modifiedTime ? entry.album : undefined
}

/** Reads a byte range through a window cache, so frame headers close together share one request. */
class RangeReader {
  private start = 0
  private bytes = new Uint8Array(0)

  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length
    if (offset < this.start || end > this.start + this.bytes.length) {
      const size = Math.max(WINDOW_BYTES, length)
      const response = await fetch(this.url, {
        headers: { Range: `bytes=${offset}-${offset + size - 1}` },
      })
      // A server that ignores Range would send the whole file.
      if (response.status !== 206) throw new Error(`range ${response.status}`)
      this.bytes = new Uint8Array(await response.arrayBuffer())
      this.start = offset
      if (this.bytes.length < length) throw new Error("short read")
    }
    return this.bytes.subarray(
      offset - this.start,
      offset - this.start + length
    )
  }
}

const synchsafe = (b: Uint8Array, at: number) =>
  ((b[at]! & 0x7f) << 21) |
  ((b[at + 1]! & 0x7f) << 14) |
  ((b[at + 2]! & 0x7f) << 7) |
  (b[at + 3]! & 0x7f)

const bigEndian = (b: Uint8Array, at: number, bytes: 3 | 4) =>
  bytes === 3
    ? (b[at]! << 16) | (b[at + 1]! << 8) | b[at + 2]!
    : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>>
      0

const ENCODINGS = ["iso-8859-1", "utf-16", "utf-16be", "utf-8"]

/** Text of an ID3 text frame: an encoding byte, then the (first) string. */
function decodeText(frame: Uint8Array): string {
  const label = ENCODINGS[frame[0] ?? 0] ?? "iso-8859-1"
  const text = new TextDecoder(label).decode(frame.subarray(1))
  return text.split("\0")[0]!.trim()
}

/**
 * The album of an MP3's ID3v2 tag. Resolves null for a file with no ID3v2 tag
 * or no album in it; throws if the file can't be read.
 */
async function readAlbum(songId: string): Promise<string | null> {
  const reader = new RangeReader(streamUrl(songId))
  const header = await reader.read(0, 10)
  if (String.fromCharCode(header[0]!, header[1]!, header[2]!) !== "ID3") {
    return null
  }
  const major = header[3]!
  if (major < 2 || major > 4) return null
  const tagEnd = 10 + synchsafe(header, 6)

  let pos = 10
  // Version 2.3/2.4 may put an extended header before the frames.
  if (major >= 3 && header[5]! & 0x40) {
    const ext = await reader.read(pos, 4)
    pos += major === 4 ? synchsafe(ext, 0) : bigEndian(ext, 0, 4) + 4
  }

  const v22 = major === 2
  const headerLength = v22 ? 6 : 10
  const wanted = v22 ? "TAL" : "TALB"
  while (pos + headerLength <= tagEnd) {
    const frameHeader = await reader.read(pos, headerLength)
    if (frameHeader[0] === 0) return null // padding: no more frames
    const id = String.fromCharCode(...frameHeader.subarray(0, wanted.length))
    const size = v22
      ? bigEndian(frameHeader, 3, 3)
      : major === 4
        ? synchsafe(frameHeader, 4)
        : bigEndian(frameHeader, 4, 4)
    if (id === wanted) {
      if (size < 2 || size > MAX_FRAME_BYTES) return null
      const text = decodeText(await reader.read(pos + headerLength, size))
      return text || null
    }
    pos += headerLength + size
  }
  return null
}

/**
 * Reads the album tags of `songs` that aren't known yet, a few at a time.
 * Stops (after the requests in flight) when `isCancelled` turns true.
 * Songs that fail to read are left unknown and tried again next time.
 */
export async function loadAlbumTags(
  songs: readonly Song[],
  isCancelled: () => boolean
): Promise<void> {
  const pending = songs.filter(
    (song) => peekAlbumTag(song) === undefined && !inflight.has(song.id)
  )
  let next = 0
  const worker = async () => {
    while (!isCancelled()) {
      const song = pending[next++]
      if (!song) return
      inflight.add(song.id)
      try {
        entries.set(song.id, {
          album: await readAlbum(song.id),
          at: song.modifiedTime,
        })
        notifySoon()
      } catch {
        /* unreadable for now; retried on the next visit */
      } finally {
        inflight.delete(song.id)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}
