const cache = new Map<string, number>()

/**
 * An artist's monthly listeners, from the edge-cached `/api/artist-listeners`.
 * Resolves null when it can't be fetched, so callers just leave it out.
 */
export async function fetchArtistListeners(
  name: string
): Promise<number | null> {
  const known = cache.get(name)
  if (known !== undefined) return known
  try {
    const response = await fetch(
      `/api/artist-listeners?name=${encodeURIComponent(name)}`
    )
    if (!response.ok) return null
    const { listeners } = (await response.json()) as { listeners: number }
    if (!Number.isFinite(listeners)) return null
    cache.set(name, listeners)
    return listeners
  } catch {
    return null
  }
}
