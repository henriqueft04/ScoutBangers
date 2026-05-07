import { parseBlob } from "music-metadata"

import { streamUrl } from "./audio-url"

/**
 * Metadata extracted from an audio file's embedded tags (ID3, MP4 atoms,
 * Vorbis comments, etc.). Every field is optional — files often have
 * incomplete tags.
 */
export interface TrackMetadata {
  artist?: string
  album?: string
  title?: string
  /** Object URL for `<img src>`. Cached for the app's lifetime. */
  pictureUrl?: string
  /** Data URL (base64). Used for cross-process consumers like
   *  `mediaSession.metadata.artwork`, which some platforms can't load from
   *  same-origin Blob URLs. */
  pictureDataUrl?: string
  pictureType?: string
}

/**
 * Bytes to fetch when reading a track's metadata. Most ID3 tags (including
 * embedded album art) sit at the front of the file; we pull 512 KB to handle
 * larger embedded artwork without a second roundtrip.
 */
const PARTIAL_BYTES = 512 * 1024

const resolved = new Map<string, TrackMetadata>()
const inflight = new Map<string, Promise<TrackMetadata>>()
const subscribers = new Map<string, Set<() => void>>()

/** Synchronous read of cached metadata. Returns `undefined` if not parsed yet. */
export function peekTrackMetadata(songId: string): TrackMetadata | undefined {
  return resolved.get(songId)
}

/** Subscribe to updates for a single song's metadata. Powers `useSyncExternalStore`. */
export function subscribeToMetadata(
  songId: string,
  listener: () => void
): () => void {
  let set = subscribers.get(songId)
  if (!set) {
    set = new Set()
    subscribers.set(songId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) subscribers.delete(songId)
  }
}

/**
 * Kick off (or join) a metadata fetch. Resolved values land in the cache and
 * notify subscribers. Failures cache to an empty object so we don't retry on
 * every render.
 */
export function ensureTrackMetadata(songId: string): Promise<TrackMetadata> {
  const cached = resolved.get(songId)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(songId)
  if (pending) return pending

  const promise = fetchAndParse(songId)
    .catch(() => ({}) as TrackMetadata)
    .then((value) => {
      resolved.set(songId, value)
      inflight.delete(songId)
      subscribers.get(songId)?.forEach((fn) => fn())
      return value
    })
  inflight.set(songId, promise)
  return promise
}

async function fetchAndParse(songId: string): Promise<TrackMetadata> {
  const response = await fetch(streamUrl(songId), {
    headers: { Range: `bytes=0-${PARTIAL_BYTES - 1}` },
  })
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`metadata fetch ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const blob = new Blob([buffer])
  const metadata = await parseBlob(blob, {
    skipCovers: false,
    skipPostHeaders: true,
    duration: false,
  })

  const result: TrackMetadata = {
    artist: metadata.common.artist || undefined,
    album: metadata.common.album || undefined,
    title: metadata.common.title || undefined,
  }

  const picture = metadata.common.picture?.[0]
  if (picture) {
    const pictureBlob = new Blob([new Uint8Array(picture.data)], {
      type: picture.format,
    })
    result.pictureUrl = URL.createObjectURL(pictureBlob)
    result.pictureType = picture.format
    result.pictureDataUrl = await blobToDataUrl(pictureBlob)
  }

  return result
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}
