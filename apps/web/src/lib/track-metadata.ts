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

/**
 * Single global gap between metadata fetches. With one in-flight request and
 * a 500 ms gap that's 2 req/s — well under Drive's documented per-project
 * limits and gentle enough to coexist with audio playback's Range requests.
 */
const FETCH_GAP_MS = 500

/**
 * Circuit breaker config: after this many consecutive failures (typically a
 * Drive 403 abuse trip), stop all metadata fetching for `COOLDOWN_MS` so we
 * don't compound the problem.
 */
const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 5 * 60 * 1000

const resolved = new Map<string, TrackMetadata>()
const inflight = new Map<string, Promise<TrackMetadata>>()
const subscribers = new Map<string, Set<() => void>>()
const globalSubscribers = new Set<() => void>()

let consecutiveFailures = 0
let cooldownUntil = 0
let lastFetchAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** Synchronous read of cached metadata. Returns `undefined` if not parsed yet. */
export function peekTrackMetadata(songId: string): TrackMetadata | undefined {
  return resolved.get(songId)
}

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

export function subscribeToAnyMetadata(listener: () => void): () => void {
  globalSubscribers.add(listener)
  return () => {
    globalSubscribers.delete(listener)
  }
}

/**
 * Kick off (or join) a metadata fetch. All work goes through a single global
 * queue (with a 500 ms gap between requests) so multiple visible rows don't
 * stampede Drive. A circuit breaker pauses the queue after repeated failures.
 */
export function ensureTrackMetadata(songId: string): Promise<TrackMetadata> {
  const cached = resolved.get(songId)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(songId)
  if (pending) return pending

  const promise = enqueue(() => fetchAndParse(songId))
    .then((value) => {
      consecutiveFailures = 0
      resolved.set(songId, value)
      inflight.delete(songId)
      subscribers.get(songId)?.forEach((fn) => fn())
      globalSubscribers.forEach((fn) => fn())
      return value
    })
    .catch((error: unknown) => {
      inflight.delete(songId)
      consecutiveFailures += 1
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        cooldownUntil = Date.now() + COOLDOWN_MS
        consecutiveFailures = 0
        console.warn(
          `[track-metadata] entering ${COOLDOWN_MS / 1000}s cooldown after repeated failures`
        )
      }
      console.warn("[track-metadata] fetch failed", { songId, error })
      return {} as TrackMetadata
    })
  inflight.set(songId, promise)
  return promise
}

async function fetchAndParse(songId: string): Promise<TrackMetadata> {
  if (Date.now() < cooldownUntil) {
    throw new Error("metadata fetcher in cooldown")
  }
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

/**
 * Serialise an async task onto the global queue, ensuring at least
 * `FETCH_GAP_MS` between consecutive runs.
 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const since = Date.now() - lastFetchAt
    if (since < FETCH_GAP_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, FETCH_GAP_MS - since)
      )
    }
    try {
      return await task()
    } finally {
      lastFetchAt = Date.now()
    }
  })
  // Prevent the chain from rejecting future tasks.
  queue = next.catch(() => undefined)
  return next as Promise<T>
}

interface PrefetchOptions {
  /** Only retry songs not already in the cache. Default: true. */
  skipCached?: boolean
}

/**
 * Walk every song id and ask for its metadata. The single global queue (see
 * `enqueue`) handles pacing — this just feeds it. Disabled by default; the
 * provider opts in once the audio session is comfortably idle.
 */
export async function prefetchAllMetadata(
  songIds: readonly string[],
  { skipCached = true }: PrefetchOptions = {}
): Promise<void> {
  for (const id of songIds) {
    if (skipCached && resolved.has(id)) continue
    if (Date.now() < cooldownUntil) return
    await ensureTrackMetadata(id).catch(() => undefined)
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}
