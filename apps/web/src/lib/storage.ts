/**
 * Tiny JSON+TTL wrapper around `localStorage`. Returns `null` if the entry is
 * missing, expired, or unparseable. SSR-safe: silently no-ops when `window`
 * isn't available.
 */
export function getCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number }
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

/**
 * Like `getCached` but ignores expiry — returns the stored value even if the
 * TTL has passed. Useful as an offline fallback so stale data is shown rather
 * than nothing at all.
 */
export function getStaleCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value: T }
    return parsed.value ?? null
  } catch {
    return null
  }
}

/** Persist `value` under `key` for `ttlMs` milliseconds. */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (typeof window === "undefined") return
  try {
    const payload = JSON.stringify({ value, expiresAt: Date.now() + ttlMs })
    window.localStorage.setItem(key, payload)
  } catch {
    /* quota exceeded or storage disabled — fail silently */
  }
}
