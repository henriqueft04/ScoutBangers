import * as React from "react"

import { useAuth } from "./useAuth"
import { usePlayer } from "./usePlayer"
import { peekTrackMetadata } from "@/lib/track-metadata"
import { supabase } from "@/lib/supabase"

/**
 * Records a "play" in Supabase once the current song has been actively
 * playing for 30 seconds (Spotify's threshold). Uses wall-clock time via
 * a 1 Hz `setInterval` rather than the position field — that survives
 * timeupdate hiccups, mobile Safari pause/resume jitter, and any race
 * between React state and the audio element. Pausing freezes the
 * accumulator; resuming continues it.
 *
 * Anonymous users still get tracked (user_id NULL) so global top-10
 * counts everyone, not just signed-in listeners.
 */
const PLAY_THRESHOLD_SECONDS = 30

export function usePlayTracking(): void {
  const { user } = useAuth()
  const { songs, currentIndex, isPlaying } = usePlayer()
  const elapsedRef = React.useRef(0)
  const recordedRef = React.useRef(false)

  const songId = currentIndex !== null ? songs[currentIndex]?.id ?? null : null

  // Reset accumulator + recorded flag on song change.
  React.useEffect(() => {
    elapsedRef.current = 0
    recordedRef.current = false
  }, [songId])

  // While playing, tick once per second. Cleanup on pause / song change
  // freezes the count where it was so resuming continues, not restarts.
  React.useEffect(() => {
    const sb = supabase
    if (!sb) {
      if (isPlaying && songId) {
        console.info("[plays] disabled — Supabase not configured")
      }
      return
    }
    if (!isPlaying || !songId) return
    if (recordedRef.current) return

    const trackId = songId
    console.info(
      `[plays] tracking ${trackId.slice(0, 8)}… (signed in: ${Boolean(user)})`
    )

    const interval = setInterval(() => {
      elapsedRef.current += 1
      if (elapsedRef.current < PLAY_THRESHOLD_SECONDS) return
      if (recordedRef.current) return

      recordedRef.current = true
      const meta = peekTrackMetadata(trackId)
      const userId = user?.id ?? null
      void sb
        .from("plays")
        .insert({ user_id: userId, song_id: trackId, artist: meta?.artist ?? null })
        .then(({ error }) => {
          if (error) {
            console.warn("[plays] insert failed", error)
            recordedRef.current = false
          } else {
            console.info("[plays] recorded", { songId: trackId, userId })
          }
        })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, songId, user])
}
