/**
 * Lyrics lookup, IndexedDB-cached.
 *
 * The server-side /api/lyrics endpoint reads our Google Doc from
 * Drive, parses headings → lyrics, and returns a JSON map keyed by
 * normalized title (lowercase, accent-stripped, punctuation-flattened).
 *
 * On the client we cache the whole map in IDB with a 24 h TTL — the
 * doc is updated occasionally but not by the minute, so per-session
 * refetches would be wasteful. Re-fetch happens automatically once
 * the cache ages out, or eagerly when a lookup misses (might be a
 * newly added song). Sync between cache and live is best-effort: we
 * always return whatever's available immediately, and update in the
 * background.
 */

// Bump the version when the parser changes shape (chord stripping,
// paragraph spacing, etc.) so existing clients abandon their old
// cached payload and refetch fresh.
const STORAGE_KEY = "scoutbangers:lyrics-cache-v2"
const LEGACY_STORAGE_KEYS = ["scoutbangers:lyrics-cache-v1"]
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

interface LyricsPayload {
  modifiedTime: string | null
  songs: Record<string, string>
  titles: string[]
}

interface CachedPayload extends LyricsPayload {
  /** Wall-clock timestamp when this was fetched. */
  fetchedAt: number
}

let memoryCache: CachedPayload | null = null
let inflight: Promise<CachedPayload | null> | null = null

function normalizeTitle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Common suffixes that exist in audio file titles but not in the
 * Cancioneiro entry. Stripped from the query before fuzzy match.
 */
const SUFFIX_NOISE = [
  /\s+live\b.*$/i,
  /\s+ao vivo\b.*$/i,
  /\s+acustico\b.*$/i,
  /\s+acoustic\b.*$/i,
  /\s+remix\b.*$/i,
  /\s+versao\s.*$/i,
  /\s+v\s*\d+.*$/i,
  /\s+oficial\b.*$/i,
  /\s+official\b.*$/i,
  /\s+demo\b.*$/i,
  /\s+cover\b.*$/i,
]

function strippedNormalized(raw: string): string {
  let s = normalizeTitle(raw)
  let prev: string
  do {
    prev = s
    for (const re of SUFFIX_NOISE) s = s.replace(re, "")
    s = s.trim()
  } while (s !== prev)
  return s
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean))
}

function isSubset(needle: Set<string>, hay: Set<string>): boolean {
  if (needle.size === 0) return false
  for (const t of needle) if (!hay.has(t)) return false
  return true
}

/**
 * Best-effort fuzzy lookup of a song title against the cached map.
 * Tries, in order: exact normalized match → suffix-stripped match →
 * cache key is a substring/prefix of the query → query is a
 * substring of the cache key → all tokens of one fully contained
 * in the other. Returns undefined if nothing scores above the
 * threshold.
 */
function fuzzyMatch(
  query: string,
  songs: Record<string, string>
): string | undefined {
  const normalized = normalizeTitle(query)
  if (songs[normalized]) return songs[normalized]
  const stripped = strippedNormalized(query)
  if (stripped && songs[stripped]) return songs[stripped]
  if (!normalized && !stripped) return undefined

  const candidates = [normalized, stripped].filter(Boolean) as string[]
  const queryTokens = candidates.map(tokenSet)

  let bestScore = 0
  let bestBody: string | undefined

  for (const [key, body] of Object.entries(songs)) {
    const keyTokens = tokenSet(key)
    let score = 0
    for (const cand of candidates) {
      if (cand === key) {
        score = Math.max(score, 100)
        continue
      }
      // Cache key is a prefix of the query: "caminho" vs "caminho live"
      if (cand.startsWith(key + " ") || cand.startsWith(key)) {
        score = Math.max(score, 90)
      } else if (cand.endsWith(" " + key)) {
        score = Math.max(score, 80)
      } else if (cand.includes(" " + key + " ")) {
        score = Math.max(score, 75)
      }
      // Query is a prefix/contained-in the key (rarer): "caminho" vs "o caminho da paz"
      if (key.includes(" " + cand + " ") || key.startsWith(cand + " ") || key.endsWith(" " + cand)) {
        score = Math.max(score, 70)
      }
    }
    for (const qTokens of queryTokens) {
      if (isSubset(keyTokens, qTokens)) {
        score = Math.max(score, 65)
      } else if (isSubset(qTokens, keyTokens)) {
        score = Math.max(score, 60)
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestBody = body
    }
  }

  return bestScore >= 60 ? bestBody : undefined
}

function readCache(): CachedPayload | null {
  if (memoryCache) return memoryCache
  if (typeof localStorage === "undefined") return null
  try {
    // Drop any older-version caches on first read so they don't
    // linger in the user's storage forever.
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPayload
    if (
      typeof parsed.fetchedAt === "number" &&
      typeof parsed.songs === "object"
    ) {
      memoryCache = parsed
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(payload: CachedPayload): void {
  memoryCache = payload
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — keep memory cache, lose persistence.
  }
}

async function fetchFresh(): Promise<CachedPayload | null> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const response = await fetch("/api/lyrics")
      if (!response.ok) return null
      const data = (await response.json()) as LyricsPayload
      const next: CachedPayload = { ...data, fetchedAt: Date.now() }
      writeCache(next)
      return next
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * Best-effort lyrics lookup by display title. Returns whatever's
 * cached immediately (fast); refreshes from the network in the
 * background if the cache is stale or missing the requested title.
 *
 * Subscribe to changes via `subscribeToLyrics` to react to a
 * background refresh that fills in the requested title.
 */
export function getLyricsFor(title: string): string | undefined {
  if (!title) return undefined
  const cache = readCache()
  const hit = cache ? fuzzyMatch(title, cache.songs) : undefined

  // Trigger a background fetch if we have nothing, the cache is
  // stale, or this lookup missed (might be a song added after the
  // cache was built).
  const stale =
    !cache || Date.now() - cache.fetchedAt > REFRESH_AFTER_MS || !hit
  if (stale) {
    void fetchFresh().then((next) => {
      if (!next) return
      const nextHit = fuzzyMatch(title, next.songs)
      if (nextHit !== hit) notify()
    })
  }
  return hit
}

/** Force a refresh now; resolves with the latest cache snapshot. */
export function refreshLyrics(): Promise<CachedPayload | null> {
  return fetchFresh().then((next) => {
    if (next) notify()
    return next
  })
}

const subscribers = new Set<() => void>()

function notify(): void {
  for (const fn of subscribers) fn()
}

export function subscribeToLyrics(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function lyricsLastUpdatedAt(): number | null {
  return readCache()?.fetchedAt ?? null
}
