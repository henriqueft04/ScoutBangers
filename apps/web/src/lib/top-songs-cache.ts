import { supabase } from "@/lib/supabase"
import {
  CHART_MAX_AGE_MS,
  CHART_SIZE,
  type ChartPeriod,
} from "@/lib/top-songs-config"

export { CHART_MAX_AGE_MS, type ChartPeriod }

export interface ChartRow {
  song_id: string
  play_count: number
}

const cache = new Map<ChartPeriod, { rows: ChartRow[]; at: number }>()
const inflight = new Map<ChartPeriod, Promise<ChartRow[]>>()

/** The database sends bigint counts as strings; always hand out numbers. */
function toRows(data: { song_id: string; play_count: number | string }[]): ChartRow[] {
  return data.map((row) => ({
    song_id: row.song_id,
    play_count: Number(row.play_count),
  }))
}

/**
 * One chart, preferably from `/api/top-songs`, which answers from the edge
 * cache (see functions/api/top-songs.ts). If that is unavailable for any
 * reason — a misconfigured deploy, a network blip — ask the database
 * directly, so the home page still gets its chart, just a little slower.
 */
async function requestChart(period: ChartPeriod): Promise<ChartRow[]> {
  try {
    const response = await fetch(`/api/top-songs?period=${period}`)
    if (response.ok) return toRows(await response.json())
    console.warn(`[top-songs] edge endpoint answered ${response.status}; asking Supabase`)
  } catch {
    console.warn("[top-songs] edge endpoint unreachable; asking Supabase")
  }

  if (!supabase) throw new Error("Supabase is not configured")
  const { data, error } = await supabase.rpc("stats_top_songs", {
    period,
    lim: CHART_SIZE,
  })
  if (error) throw new Error(error.message)
  return toRows(data ?? [])
}

/**
 * The last chart fetched for `period`, however old — to show instantly while
 * a fresh one loads. Lives for the page's lifetime, so it also survives
 * leaving the home tab and coming back.
 */
export function peekChart(period: ChartPeriod): ChartRow[] | undefined {
  return cache.get(period)?.rows
}

/**
 * The chart for `period`: from the cache when it is younger than
 * `maxAgeMs`, otherwise fetched. Simultaneous callers (a hover prefetch and
 * the click that follows it) share one request, and a failed request is
 * neither cached nor remembered, so the next call retries.
 */
export function fetchChart(
  period: ChartPeriod,
  maxAgeMs: number = CHART_MAX_AGE_MS[period]
): Promise<ChartRow[]> {
  const cached = cache.get(period)
  if (cached && Date.now() - cached.at < maxAgeMs) {
    return Promise.resolve(cached.rows)
  }
  const pending = inflight.get(period)
  if (pending) return pending

  const request = requestChart(period)
    .then((rows) => {
      cache.set(period, { rows, at: Date.now() })
      return rows
    })
    .finally(() => inflight.delete(period))

  inflight.set(period, request)
  return request
}
