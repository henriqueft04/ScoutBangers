import { AUDIO_CACHE } from "./audio-cache-name"

const AUDIO_BASE_URL =
  (import.meta.env.VITE_AUDIO_BASE_URL as string | undefined) ??
  "https://audio.scoutbangers.com"

/**
 * Audio is served directly from a public R2 bucket on a custom domain.
 * Object key = Drive file ID, mirrored by the Drive→R2 sync Worker.
 * R2 supports Range natively, so HTML5 seeking works without a proxy.
 */
export function streamUrl(id: string): string {
  return `${AUDIO_BASE_URL}/${encodeURIComponent(id)}`
}

/**
 * Module-level map of songId → resolved src.
 * Blob URLs are used for downloaded songs so playback works offline
 * without relying on SW fetch interception (iOS doesn't intercept
 * cross-origin media requests through the SW).
 */
const resolvedSrcMap = new Map<string, string>()

/**
 * Synchronous peek — returns the pre-resolved blob URL if available,
 * otherwise falls back to the R2 stream URL. Safe to call anywhere;
 * call `resolveAudioSrc` in the background to warm the map.
 */
export function peekResolvedSrc(songId: string): string {
  return resolvedSrcMap.get(songId) ?? streamUrl(songId)
}

/**
 * Resolve the best src for a song: blob URL if the song is in the audio
 * cache (works offline and on iOS), R2 URL otherwise. The result is
 * stored in `resolvedSrcMap` so subsequent `peekResolvedSrc` calls are
 * synchronous.
 */
export async function resolveAudioSrc(songId: string): Promise<string> {
  const existing = resolvedSrcMap.get(songId)
  if (existing) return existing

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(AUDIO_CACHE)
      const cached = await cache.match(streamUrl(songId), { ignoreVary: true })
      if (cached) {
        const blob = await cached.blob()
        const url = URL.createObjectURL(blob)
        resolvedSrcMap.set(songId, url)
        return url
      }
    } catch {
      /* Cache API unavailable — fall through to R2 */
    }
  }

  return streamUrl(songId)
}

/**
 * Pre-resolve blob URLs for a batch of songs in the background.
 * Call after the song list loads so `peekResolvedSrc` returns blob URLs
 * by the time the user hits play.
 */
export async function preResolveAudioSrcs(songIds: string[]): Promise<void> {
  await Promise.all(songIds.map((id) => resolveAudioSrc(id).catch(() => undefined)))
}

/**
 * Invalidate the resolved src for a song (e.g., after evicting from
 * the audio cache). Revokes the blob URL to free memory.
 */
export function invalidateResolvedSrc(songId: string): void {
  const url = resolvedSrcMap.get(songId)
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url)
  resolvedSrcMap.delete(songId)
}
