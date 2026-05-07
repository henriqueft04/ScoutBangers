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
