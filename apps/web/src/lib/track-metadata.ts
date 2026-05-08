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
 * Gap between metadata fetches. Service-account auth doesn't trigger
 * Drive's IP-level abuse detector the way the old API key did, so we
 * can be more aggressive than the legacy 500 ms. 200 ms = ~5 req/s,
 * still well within Drive's per-project quota and won't choke audio
 * Range requests.
 */
const FETCH_GAP_MS = 200

/**
 * Circuit breaker — only kicks in on a sustained run of failures (real
 * problem). Was 3 with a 5-minute cooldown for the old IP-abuse case;
 * that turned a single transient 502 into 5 minutes of missing
 * thumbnails. Loosened to 10 failures and 60 s cooldown.
 */
const FAILURE_THRESHOLD = 10
const COOLDOWN_MS = 60 * 1000

const resolved = new Map<string, TrackMetadata>()
const inflight = new Map<string, Promise<TrackMetadata>>()
const subscribers = new Map<string, Set<() => void>>()
const globalSubscribers = new Set<() => void>()

let consecutiveFailures = 0
let cooldownUntil = 0
let lastFetchAt = 0
let queue: Promise<unknown> = Promise.resolve()

/**
 * Persistent cache: text + base64 artwork keyed by Drive file id.
 * Survives page reloads; the whole library (~80 songs × ~50 KB) fits
 * comfortably under localStorage's 5 MB budget. We catch QuotaExceeded
 * and downgrade to text-only when we hit the wall.
 */
const STORAGE_KEY = "scoutbangers:track-metadata-v1"

interface PersistedEntry {
  artist?: string
  album?: string
  title?: string
  pictureDataUrl?: string
  pictureType?: string
}

function loadPersistedCache(): void {
  if (typeof localStorage === "undefined") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, PersistedEntry>
    for (const [id, entry] of Object.entries(parsed)) {
      const metadata: TrackMetadata = {
        artist: entry.artist,
        album: entry.album,
        title: entry.title,
        pictureDataUrl: entry.pictureDataUrl,
        pictureType: entry.pictureType,
      }
      // pictureUrl is recreated from the data URL on demand; the data URL
      // works directly in <img src> too, so we just use it as the URL.
      if (entry.pictureDataUrl) metadata.pictureUrl = entry.pictureDataUrl
      resolved.set(id, metadata)
    }
  } catch (error) {
    console.warn("[track-metadata] failed to load persisted cache", error)
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist(): void {
  if (typeof localStorage === "undefined") return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const out: Record<string, PersistedEntry> = {}
    for (const [id, metadata] of resolved.entries()) {
      out[id] = {
        artist: metadata.artist,
        album: metadata.album,
        title: metadata.title,
        pictureDataUrl: metadata.pictureDataUrl,
        pictureType: metadata.pictureType,
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
    } catch {
      // Quota exceeded — try again without artwork (text only is a tiny
      // fraction of the size and still solves the cold-start problem).
      const lite: Record<string, PersistedEntry> = {}
      for (const [id, metadata] of resolved.entries()) {
        lite[id] = {
          artist: metadata.artist,
          album: metadata.album,
          title: metadata.title,
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lite))
      } catch {
        // give up — we still have the in-memory cache for this session
      }
    }
  }, 500)
}

loadPersistedCache()

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
      schedulePersist()
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
