import { supabase } from "@/lib/supabase"

/** Matches the edge cache's lifetime (functions/api/song-plays.ts). */
const MAX_AGE_MS = 10 * 60 * 1000

interface PlayCountRow {
  song_id: string
  play_count: number | string
}

let cached: { counts: Map<string, number>; at: number } | undefined
let inflight: Promise<Map<string, number>> | undefined

const toMap = (rows: PlayCountRow[]) =>
  new Map(rows.map((row) => [row.song_id, Number(row.play_count)]))

/**
 * Preferably from `/api/song-plays`, which answers from the edge cache. If
 * that is unavailable (a misconfigured deploy, a network blip) the database
 * is asked directly, so artist pages still show their counts, just slower.
 */
async function requestCounts(): Promise<Map<string, number>> {
  try {
    const response = await fetch("/api/song-plays")
    if (response.ok) return toMap((await response.json()) as PlayCountRow[])
  } catch {
    /* fall through to Supabase */
  }
  if (!supabase) throw new Error("Supabase is not configured")
  const { data, error } = await supabase.rpc("stats_top_songs", {
    period: "all",
    lim: 10_000,
  })
  if (error) throw new Error(error.message)
  return toMap(data ?? [])
}

/**
 * All-time play count of every song, reused for 10 minutes. Simultaneous
 * callers share one request; a failed request isn't remembered.
 */
export function fetchSongPlayCounts(): Promise<Map<string, number>> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) {
    return Promise.resolve(cached.counts)
  }
  inflight ??= requestCounts()
    .then((counts) => {
      cached = { counts, at: Date.now() }
      return counts
    })
    .finally(() => {
      inflight = undefined
    })
  return inflight
}
