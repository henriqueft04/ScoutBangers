import * as React from "react"

import { useAuth } from "./useAuth"
import { supabase } from "@/lib/supabase"
import { ensureTrackMetadata } from "@/lib/track-metadata"

// Runs at most once per browser session regardless of re-renders.
let ran = false

/**
 * One-time background backfill: finds all distinct song_ids in `plays`
 * that are missing duration_seconds, fetches their metadata from audio
 * tags, and patches the rows via a security-definer RPC so that one
 * user's run fixes the data for everyone.
 */
export function useBackfillPlayDurations(): void {
  const { user } = useAuth()

  React.useEffect(() => {
    if (!user || !supabase || ran) return
    ran = true
    const sb = supabase

    void (async () => {
      // Fetch distinct song_ids that still need a duration.
      const { data, error } = await sb
        .from("plays")
        .select("song_id")
        .is("duration_seconds", null)

      if (error || !data || data.length === 0) return

      const songIds = [...new Set(data.map((r) => r.song_id))]
      console.info(`[backfill] fetching durations for ${songIds.length} songs`)

      for (const songId of songIds) {
        try {
          const meta = await ensureTrackMetadata(songId)
          if (typeof meta.duration !== "number" || meta.duration <= 0) continue
          await sb.rpc("backfill_play_duration", {
            p_song_id: songId,
            p_duration_seconds: Math.round(meta.duration),
          })
        } catch {
          // Best-effort: skip songs that fail and continue.
        }
      }

      console.info("[backfill] done")
    })()
  }, [user])
}
