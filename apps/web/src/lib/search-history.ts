/**
 * Tiny localStorage-backed list of recent search terms. Per device.
 * Most-recent-first, deduped by query (case-insensitive), capped at
 * MAX_ENTRIES.
 *
 * Each entry can optionally carry the song the search ultimately led
 * to playing — recorded by the player when a play() happens while a
 * search is active. That lets the dropdown show both the query and
 * "you ended up listening to ..." for past searches.
 */

const STORAGE_KEY = "scoutbangers:search-history-v2"
const LEGACY_STORAGE_KEY = "scoutbangers:search-history-v1"
const MAX_ENTRIES = 8
const MIN_LENGTH = 2

export interface SearchHistoryEntry {
  query: string
  /** Song the user ended up playing after this search, if any. */
  song?: {
    id: string
    title: string
    artist?: string
  }
}

function read(): SearchHistoryEntry[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (e): e is SearchHistoryEntry =>
          typeof e === "object" && e !== null && typeof e.query === "string"
      )
    }
    // One-time migration from the v1 string-only store.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return []
    const legacyParsed = JSON.parse(legacy)
    if (!Array.isArray(legacyParsed)) return []
    const migrated: SearchHistoryEntry[] = legacyParsed
      .filter((s): s is string => typeof s === "string")
      .map((query) => ({ query }))
    if (migrated.length > 0) write(migrated)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return migrated
  } catch {
    return []
  }
}

function write(entries: SearchHistoryEntry[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* ignore quota errors */
  }
}

export function getSearchHistory(): SearchHistoryEntry[] {
  return read()
}

/**
 * Add or update a history entry. Trims whitespace, drops very short
 * queries, and de-dupes against existing entries by lowercased query.
 *
 * If `song` is supplied, it's stored on the entry; if the query
 * already existed without a song, this upgrades it. If `song` is
 * omitted and the existing entry already has one, the existing song
 * is preserved (so a later blur-only commit doesn't wipe a song that
 * was attributed to the same query earlier).
 */
export function rememberSearch(
  query: string,
  song?: SearchHistoryEntry["song"]
): void {
  const trimmed = query.trim()
  if (trimmed.length < MIN_LENGTH) return
  const existing = read()
  const lower = trimmed.toLowerCase()
  const prior = existing.find((e) => e.query.toLowerCase() === lower)
  const filtered = existing.filter((e) => e.query.toLowerCase() !== lower)
  const next: SearchHistoryEntry = {
    query: trimmed,
    song: song ?? prior?.song,
  }
  filtered.unshift(next)
  write(filtered.slice(0, MAX_ENTRIES))
}

export function removeSearch(query: string): void {
  const lower = query.toLowerCase()
  const next = read().filter((e) => e.query.toLowerCase() !== lower)
  write(next)
}

export function clearSearchHistory(): void {
  write([])
}
