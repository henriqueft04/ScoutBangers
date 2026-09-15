/**
 * Format a number of seconds as `m:ss` (or `h:mm:ss` if >= 1 hour).
 *
 * Returns `"-:--"` for non-finite or negative inputs so the UI never has to
 * special-case the "no song loaded" state.
 */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "-:--"
  }

  const seconds = Math.floor(totalSeconds % 60)
  const minutes = Math.floor((totalSeconds / 60) % 60)
  const hours = Math.floor(totalSeconds / 3600)

  const pad = (n: number) => n.toString().padStart(2, "0")

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }

  return `${minutes}:${pad(seconds)}`
}

/** Format a byte count as a human-readable KB/MB/GB string, e.g. "42 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
