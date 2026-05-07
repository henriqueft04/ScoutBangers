import * as React from "react"

import { useAuth } from "./useAuth"
import { usePlayer } from "./usePlayer"
import { peekTrackMetadata } from "@/lib/track-metadata"
import { supabase } from "@/lib/supabase"

/**
 * Records a "play" in Supabase once the current song crosses 30 s of
 * elapsed playback time (Spotify's threshold). Each song id triggers at
 * most one insert per playback session — switching songs and coming back
 * starts a fresh 30 s budget.
 *
 * Anonymous users still get tracked (user_id NULL) so global top-10
 * counts everyone, not just signed-in listeners.
 *
 * Sends `artist` from the cached ID3 metadata when available; null when
 * not yet fetched (the metadata loads lazily on scroll).
 */
const PLAY_THRESHOLD_SECONDS = 30

export function usePlayTracking(): void {
  const { user } = useAuth()
  const { songs, currentIndex, isPlaying, position } = usePlayer()
  const elapsedRef = React.useRef(0)
  const lastPositionRef = React.useRef(0)
  const recordedRef = React.useRef<string | null>(null)
  const lastSongRef = React.useRef<string | null>(null)

  const songId =
    currentIndex !== null ? songs[currentIndex]?.id ?? null : null

  // Reset accumulator on song change.
  React.useEffect(() => {
    if (songId !== lastSongRef.current) {
      elapsedRef.current = 0
      lastPositionRef.current = position
      recordedRef.current = null
      lastSongRef.current = songId
    }
  }, [songId, position])

  React.useEffect(() => {
    if (!isPlaying || songId === null) {
      lastPositionRef.current = position
      return
    }
    // Only count forward, monotonic playback (ignore seek-back jumps and
    // tiny backwards drifts).
    const delta = position - lastPositionRef.current
    if (delta > 0 && delta < 2) {
      elapsedRef.current += delta
    }
    lastPositionRef.current = position

    if (
      elapsedRef.current >= PLAY_THRESHOLD_SECONDS &&
      recordedRef.current !== songId &&
      supabase
    ) {
      recordedRef.current = songId
      const meta = peekTrackMetadata(songId)
      const artist = meta?.artist ?? null
      void supabase.from("plays").insert({
        user_id: user?.id ?? null,
        song_id: songId,
        artist,
      })
    }
  }, [position, isPlaying, songId, user])
}
