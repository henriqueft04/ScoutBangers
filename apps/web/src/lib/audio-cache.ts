/**
 * Audio cache: download songs into the browser's Cache API so the
 * service worker can serve them instantly (and offline) instead of
 * round-tripping to the Drive proxy on every play.
 *
 * Storage model:
 *   - Each cached song is stored under `/api/stream/<id>` (same URL the
 *     audio element fetches) so the SW's intercept handler matches it
 *     transparently. The app never has to know whether a song is local
 *     or remote — it just plays.
 *   - The original `modifiedTime` from `/api/songs` is stored as an
 *     `X-Modified-Time` response header on the cached entry. On every
 *     listing pass we compare it to the manifest's current value to
 *     evict stale entries (a song re-uploaded with new tags).
 *
 * The cache is populated only via {@link downloadSong}; we never auto-
 * cache streamed bytes (that would silently fill storage with partial
 * blobs as the user scrubs around).
 */

const AUDIO_CACHE = "scoutbangers-audio-v1"

export interface DownloadProgress {
  /** Bytes received so far. */
  received: number
  /** Bytes total — `0` when the upstream response didn't include a length. */
  total: number
}

export interface AudioCacheStats {
  /** Set of song ids currently in the cache. */
  cachedIds: Set<string>
  /** Map of stale ids → new modifiedTime so the caller can decide what to do. */
  staleIds: Map<string, string>
}

function streamPath(songId: string): string {
  return `/api/stream/${encodeURIComponent(songId)}`
}

function songIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url, self.location?.origin ?? "https://x")
    const match = /^\/api\/stream\/([^/?#]+)$/.exec(u.pathname)
    return match ? decodeURIComponent(match[1]!) : null
  } catch {
    return null
  }
}

async function openAudioCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null
  try {
    return await caches.open(AUDIO_CACHE)
  } catch {
    return null
  }
}

/**
 * Download a song into the audio cache. `onProgress` is called as bytes
 * stream in. Resolves once the full body is in the cache.
 *
 * Throws if the upstream proxy errors. If the file is already cached
 * with a matching `modifiedTime`, returns immediately without redoing
 * the network work.
 */
export async function downloadSong(
  songId: string,
  modifiedTime: string | undefined,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const cache = await openAudioCache()
  if (!cache) throw new Error("Cache API unavailable")

  // Skip if already cached with the same modifiedTime.
  const existing = await cache.match(streamPath(songId), {
    ignoreVary: true,
  })
  if (existing) {
    const existingMtime = existing.headers.get("X-Modified-Time") || ""
    if (!modifiedTime || existingMtime === modifiedTime) return
  }

  const response = await fetch(streamPath(songId))
  if (!response.ok || !response.body) {
    throw new Error(
      `Download failed (${response.status} ${response.statusText})`
    )
  }

  const total = Number(response.headers.get("Content-Length") || 0)
  const contentType =
    response.headers.get("Content-Type") || "audio/mpeg"

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.length
      onProgress?.({ received, total })
    }
  }

  const blob = new Blob(chunks as BlobPart[], { type: contentType })
  // Build a fresh Response we control the headers of. Cache.put refuses
  // 206 / partial responses, so we synthesise a 200 with the full body.
  const cacheable = new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(blob.size),
      "Accept-Ranges": "bytes",
      "X-Modified-Time": modifiedTime ?? "",
      "X-Cached-At": String(Date.now()),
    },
  })
  await cache.put(streamPath(songId), cacheable)
}

/**
 * Walk the cache, returning the set of song ids cached and (separately)
 * any whose `modifiedTime` no longer matches the supplied manifest —
 * those are stale and should be re-downloaded if the user wants a
 * fresh copy.
 */
export async function inspectCache(
  manifest: Map<string, string | undefined>
): Promise<AudioCacheStats> {
  const cache = await openAudioCache()
  const cachedIds = new Set<string>()
  const staleIds = new Map<string, string>()
  if (!cache) return { cachedIds, staleIds }

  const requests = await cache.keys()
  for (const req of requests) {
    const id = songIdFromUrl(req.url)
    if (!id) continue
    const response = await cache.match(req, { ignoreVary: true })
    if (!response) continue
    cachedIds.add(id)
    const cachedMtime = response.headers.get("X-Modified-Time") || ""
    const currentMtime = manifest.get(id)
    if (currentMtime && cachedMtime && cachedMtime !== currentMtime) {
      staleIds.set(id, currentMtime)
    }
  }
  return { cachedIds, staleIds }
}

export async function evictSong(songId: string): Promise<void> {
  const cache = await openAudioCache()
  if (!cache) return
  await cache.delete(streamPath(songId), { ignoreVary: true })
}

export async function evictAll(): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    await caches.delete(AUDIO_CACHE)
  } catch {
    /* ignore */
  }
}

/**
 * Ask the browser to mark our origin's storage as persistent so the
 * audio cache isn't evicted under storage pressure. iOS Safari and
 * Chrome both honour this — the prompt the user sees varies (Safari
 * shows nothing, Chrome may ask explicitly past a size threshold).
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false
  }
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * Best-effort total origin storage usage (bytes). Includes IDB +
 * shell cache + audio cache, but the audio files dominate so it's a
 * useful proxy for "how much room am I using".
 */
export async function originUsage(): Promise<{
  usage: number
  quota: number
} | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null
  }
  try {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    }
  } catch {
    return null
  }
}

const HAS_DOWNLOADED_KEY = "scoutbangers:offline:opted-in"

/**
 * Mark the user as having opted into offline downloads. Called once a
 * download succeeds; consumers (the new-songs banner) read it to
 * decide whether to bother nagging the user about uncached tracks.
 */
export function markOptedIntoOffline(): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(HAS_DOWNLOADED_KEY, "1")
  } catch {
    /* ignore quota errors */
  }
}

export function hasOptedIntoOffline(): boolean {
  if (typeof localStorage === "undefined") return false
  try {
    return localStorage.getItem(HAS_DOWNLOADED_KEY) === "1"
  } catch {
    return false
  }
}

interface NetworkConnection {
  type?: string
  effectiveType?: string
  saveData?: boolean
}

/**
 * Best-effort detection of whether the user is on cellular / metered
 * data. The Network Information API isn't supported in Safari, so we
 * fall back to a heuristic on `effectiveType` (slow types are usually
 * cellular). Used to gate large bulk downloads behind explicit
 * confirmation so we don't burn through someone's mobile data plan.
 */
export function isLikelyCellular(): boolean {
  if (typeof navigator === "undefined") return false
  const conn = (navigator as { connection?: NetworkConnection }).connection
  if (!conn) return false
  if (conn.type === "cellular") return true
  if (conn.saveData === true) return true
  if (
    conn.effectiveType &&
    ["slow-2g", "2g", "3g"].includes(conn.effectiveType)
  ) {
    return true
  }
  return false
}
