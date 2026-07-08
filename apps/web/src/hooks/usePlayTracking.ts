import * as React from "react"

import { useAuth } from "./useAuth"
import { usePlayer } from "./usePlayer"
import { peekPlaybackDuration } from "@/lib/playback-duration"
import { ensureTrackMetadata, peekTrackMetadata } from "@/lib/track-metadata"
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

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return ""
  let deviceId = localStorage.getItem("sb_device_id")
  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36)
    localStorage.setItem("sb_device_id", deviceId)
  }
  return deviceId
}

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
      const userId = user?.id ?? null
      const deviceId = getOrCreateDeviceId()
      // Snapshot the player's duration estimate now, while the song is
      // still the current one — awaiting metadata below may outlive it.
      const playerDuration = peekPlaybackDuration(trackId)

      void (async () => {
        // Prefer the exact tag duration. If the parse hasn't landed by
        // the 30 s mark, wait for it instead of recording NULL. When
        // the file's tags carry no duration at all, fall back to the
        // player's estimate — without it those songs never add to
        // listening-time stats (see migration 0024's backfill).
        let meta = peekTrackMetadata(trackId)
        if (!meta) {
          meta = await ensureTrackMetadata(trackId).catch(() => undefined)
        }
        const tagDuration =
          typeof meta?.duration === "number" && meta.duration > 0
            ? Math.round(meta.duration)
            : null
        const { error } = await sb.from("plays").insert({
          user_id: userId,
          song_id: trackId,
          artist: meta?.artist ?? null,
          duration_seconds:
            tagDuration ??
            (playerDuration !== undefined ? Math.round(playerDuration) : null),
          device_id: deviceId,
        })
        if (error) {
          console.warn("[plays] insert failed", error)
          recordedRef.current = false
        } else {
          console.info("[plays] recorded", { songId: trackId, userId })
        }
      })()
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlaying, songId, user])

  // Presence heartbeat: upsert playing status to public.active_devices.
  React.useEffect(() => {
    const sb = supabase
    if (!sb) return

    const deviceId = getOrCreateDeviceId()
    if (!deviceId) return

    const updatePresence = (playing: boolean) => {
      void sb
        .from("active_devices")
        .upsert({
          device_id: deviceId,
          is_playing: playing,
          last_seen_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) {
            console.warn("[presence] upsert failed", error)
          }
        })
    }

    // Send immediate update on playback state change
    updatePresence(isPlaying)

    // Heartbeat every 15 seconds if playing
    let interval: NodeJS.Timeout | undefined
    if (isPlaying) {
      interval = setInterval(() => {
        updatePresence(true)
      }, 15000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isPlaying])
}
