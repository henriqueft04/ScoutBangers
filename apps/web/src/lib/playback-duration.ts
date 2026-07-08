/**
 * Non-reactive snapshot of the player's canonical duration for the
 * current song. Written by the player provider whenever the duration
 * changes; read synchronously at play-record time by usePlayTracking.
 *
 * Exists so consumers that only need the value at a single instant
 * (recording a play 30 s in) don't have to subscribe to the
 * high-frequency PlayerProgressContext — usePlayTracking mounts in
 * the app shell, and subscribing the shell to progress would re-render
 * the whole tree several times per second during playback.
 */

let currentSongId: string | null = null
let currentDuration = 0

export function reportPlaybackDuration(
  songId: string | null,
  duration: number
): void {
  currentSongId = songId
  currentDuration = duration
}

/**
 * The player's best duration estimate (seconds) for `songId`, or
 * `undefined` when the player isn't on that song or has no estimate
 * yet. Comes from the provider's canonical-duration logic (max of tag
 * duration and `audio.duration`), so for tagless VBR files it's the
 * browser's estimate — prefer an exact tag duration when one exists.
 */
export function peekPlaybackDuration(songId: string): number | undefined {
  if (songId !== currentSongId) return undefined
  if (!Number.isFinite(currentDuration) || currentDuration <= 0) {
    return undefined
  }
  return currentDuration
}
