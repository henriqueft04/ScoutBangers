import { parseBlob } from "music-metadata"

import { streamUrl } from "./audio-url"
import {
  deletePersisted,
  getAllPersisted,
  putPersisted,
} from "./track-metadata-store"

/**
 * Metadata extracted from an audio file's embedded tags (ID3, MP4 atoms,
 * Vorbis comments, etc.). Every field is optional — files often have
 * incomplete tags.
 */
export interface TrackMetadata {
  artist?: string
  album?: string
  title?: string
  /**
   * Exact playback duration in seconds, sourced from the file's own
   * tags (ID3v2 TLEN, Xing/Info header for VBR MP3, MP4 mvhd, etc.).
   * Preferred over `audio.duration`, which the browser estimates from
   * the bitrate of the first frame for tagless VBR files and is often
   * tens of seconds off in either direction. `undefined` when the
   * file lacks the relevant tag.
   */
  duration?: number
  /** Object URL for `<img src>`. Cached for the app's lifetime. */
  pictureUrl?: string
  /** Data URL (base64). Used for cross-process consumers like
   *  `mediaSession.metadata.artwork`, which some platforms can't load from
   *  same-origin Blob URLs. */
  pictureDataUrl?: string
  pictureType?: string
  /** Original picture as a Blob, retained so we can persist to IDB. */
  pictureBlob?: Blob
}

/**
 * Bytes to fetch when reading a track's metadata. Most ID3 tags (including
 * embedded album art) sit at the front of the file. 2 MB is enough to
 * cover commonly-large embedded covers (e.g. 1024×1024 PNGs run a few
 * hundred KB but extreme cases push past 512 KB) without paying for the
 * whole audio body.
 */
const PARTIAL_BYTES = 2 * 1024 * 1024

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
 * Persistent cache lives in IndexedDB (see `track-metadata-store.ts`).
 * Pictures are stored as Blobs (no base64 overhead) and the per-entry
 * `modifiedTime` lets us invalidate when a song is re-uploaded with
 * new tags.
 *
 * In-memory `resolved` is the working cache: hydrated from IDB on
 * startup, written-through on every successful fetch.
 */
const LEGACY_STORAGE_KEY = "scoutbangers:track-metadata-v1"

/** Per-entry modifiedTime, used to invalidate when the file changes. */
const cachedModifiedTime = new Map<string, string | undefined>()

const PICTURELESS_PURGE_KEY = "scoutbangers:meta:purged-pictureless-v2"

async function loadPersistedCache(): Promise<void> {
  // One-time cleanup of the old localStorage cache so it stops eating
  // the 5 MB budget. The IDB cache supersedes it.
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  // One-time migration: a previous bug stamped "no picture" records
  // against the new modifiedTime when the SW served stale audio bytes
  // during parsing. Those records look valid forever. Drop any entry
  // that's missing a pictureBlob so it gets re-parsed once from the
  // (by-now-fresh) bytes. Runs at most once per device.
  let purged = false
  if (typeof localStorage !== "undefined") {
    try {
      purged = localStorage.getItem(PICTURELESS_PURGE_KEY) === "1"
    } catch {
      purged = true
    }
  }

  const entries = await getAllPersisted()
  if (!purged) {
    await Promise.all(
      entries
        .filter((e) => !e.pictureBlob)
        .map((e) => deletePersisted(e.songId))
    )
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(PICTURELESS_PURGE_KEY, "1")
      } catch {
        /* ignore */
      }
    }
  }
  const usableEntries = purged ? entries : entries.filter((e) => e.pictureBlob)
  for (const entry of usableEntries) {
    const metadata: TrackMetadata = {
      artist: entry.artist,
      album: entry.album,
      title: entry.title,
      duration: entry.duration,
      pictureType: entry.pictureType,
      pictureBlob: entry.pictureBlob,
    }
    if (entry.pictureBlob) {
      metadata.pictureUrl = URL.createObjectURL(entry.pictureBlob)
      // Skip the data URL on hydration — it's only needed by
      // MediaSession when the song plays. `getPictureDataUrl` below
      // creates it lazily and caches it back into the metadata entry.
    }
    resolved.set(entry.songId, metadata)
    cachedModifiedTime.set(entry.songId, entry.modifiedTime)
  }
  globalSubscribers.forEach((fn) => fn())
}

/**
 * Lazily generate (and cache) a data URL for the picture. Used by
 * `useMediaSession` since iOS lock-screen art needs a data URL — Blob
 * URLs aren't reliably loadable from the OS process. Avoids paying the
 * base64 conversion cost for every cached song on startup.
 */
export async function getPictureDataUrl(
  songId: string
): Promise<string | undefined> {
  const meta = resolved.get(songId)
  if (!meta) return undefined
  if (meta.pictureDataUrl) return meta.pictureDataUrl
  if (!meta.pictureBlob) return undefined
  const dataUrl = await blobToDataUrl(meta.pictureBlob)
  meta.pictureDataUrl = dataUrl
  return dataUrl
}

void loadPersistedCache()

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
 * Kick off (or join) a metadata fetch. All work goes through a single
 * global queue with a small gap between requests so visible rows don't
 * stampede Drive.
 *
 * `modifiedTime` (when supplied — the songs manifest carries it) is
 * used to invalidate the cached entry: if it doesn't match what we
 * cached previously, the entry is evicted and re-fetched. Lets a
 * re-uploaded file update its tags without a manual cache clear.
 */
export function ensureTrackMetadata(
  songId: string,
  modifiedTime?: string
): Promise<TrackMetadata> {
  const cached = resolved.get(songId)
  if (cached) {
    const cachedMtime = cachedModifiedTime.get(songId)
    const mtimeOk = !modifiedTime || cachedMtime === modifiedTime
    // Re-fetch if: has tags but no duration (pre-duration cache entry),
    // OR is completely blank (parse may have failed; blank entries are
    // never persisted to IDB so a session restart retries automatically).
    const isBlank =
      !cached.artist &&
      !cached.album &&
      !cached.title &&
      cached.duration === undefined &&
      !cached.pictureBlob
    const looksUpgradable =
      isBlank ||
      (cached.duration === undefined &&
        Boolean(
          cached.artist || cached.album || cached.title || cached.pictureBlob
        ))
    if (mtimeOk && !looksUpgradable) {
      return Promise.resolve(cached)
    }
    // Stale or pre-duration entry: evict and re-fetch.
    resolved.delete(songId)
    cachedModifiedTime.delete(songId)
    void deletePersisted(songId)
  }

  const pending = inflight.get(songId)
  if (pending) return pending

  const promise = enqueue(() => fetchAndParse(songId))
    .then(async (value) => {
      consecutiveFailures = 0
      resolved.set(songId, value)
      cachedModifiedTime.set(songId, modifiedTime)
      inflight.delete(songId)
      // Only persist if we got something useful — blank results are kept
      // in-memory for the session but not written to IDB so the next
      // session retries the fetch rather than loading a stale empty entry.
      const hasData =
        value.artist ||
        value.album ||
        value.title ||
        value.duration !== undefined ||
        value.pictureBlob
      if (hasData) {
        void putPersisted({
          songId,
          modifiedTime,
          artist: value.artist,
          album: value.album,
          title: value.title,
          duration: value.duration,
          pictureBlob: value.pictureBlob,
          pictureType: value.pictureType,
          cachedAt: Date.now(),
        })
      }
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

  // Pass 1: head of the file. Fast, covers ID3 + most front-loaded MP4
  // moov atoms. The vast majority of files are decoded here.
  let metadata = await fetchRange(songId, PARTIAL_BYTES)
  let result = await toTrackMetadata(metadata)

  // Pass 2: if nothing landed, fall back to the full file. Originally
  // gated on confirmed MP4/M4A container, but when moov is at the end
  // the first 2 MB may not even identify the container — so now we
  // retry whenever we got nothing useful, regardless of format.
  // Still cap at 30 MB to avoid choking on large rips.
  const noUsefulMeta =
    !metadata.common.picture?.[0] &&
    !metadata.common.title &&
    !metadata.common.artist
  if (noUsefulMeta) {
    try {
      metadata = await fetchRange(songId, 30 * 1024 * 1024)
      result = await toTrackMetadata(metadata)
    } catch {
      // Keep the (empty) pass-1 result.
    }
  }

  return result
}

async function fetchRange(songId: string, bytes: number) {
  const response = await fetch(streamUrl(songId), {
    headers: { Range: `bytes=0-${bytes - 1}` },
  })
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`metadata fetch ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  const blob = new Blob([buffer])
  return parseBlob(blob, {
    skipCovers: false,
    skipPostHeaders: true,
    duration: false,
  })
}

async function toTrackMetadata(
  metadata: Awaited<ReturnType<typeof parseBlob>>
): Promise<TrackMetadata> {
  const reportedDuration = metadata.format.duration
  const result: TrackMetadata = {
    artist: metadata.common.artist || undefined,
    album: metadata.common.album || undefined,
    title: metadata.common.title || undefined,
    duration:
      typeof reportedDuration === "number" && reportedDuration > 0
        ? reportedDuration
        : undefined,
  }
  const picture = metadata.common.picture?.[0]
  if (picture) {
    const pictureBlob = new Blob([new Uint8Array(picture.data)], {
      type: picture.format,
    })
    result.pictureUrl = URL.createObjectURL(pictureBlob)
    result.pictureType = picture.format
    result.pictureBlob = pictureBlob
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
 * Drop the parsed metadata for a song from every cache layer (in-
 * memory + IDB). Called whenever the audio bytes change — e.g. after
 * downloadSong succeeds with a new blob — because the IDB record is
 * keyed on the new `modifiedTime` but was parsed from whatever bytes
 * the SW served at the time, which can be stale. Without this, a
 * "no picture" record gets stamped under the new mtime and survives
 * forever (mtime matches → never re-parsed).
 */
export async function evictTrackMetadata(songId: string): Promise<void> {
  const meta = resolved.get(songId)
  if (meta?.pictureUrl) URL.revokeObjectURL(meta.pictureUrl)
  resolved.delete(songId)
  cachedModifiedTime.delete(songId)
  subscribers.get(songId)?.forEach((fn) => fn())
  globalSubscribers.forEach((fn) => fn())
  await deletePersisted(songId)
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
