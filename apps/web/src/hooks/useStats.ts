import * as React from "react"

import { supabase, supabaseConfigured } from "@/lib/supabase"

/**
 * Stats hooks for the /estatisticas page. Each hook fetches a single
 * RPC and returns `{ data, loading, error }`. Refetches when the tab
 * regains focus so a friend who's been listening shows up promptly.
 */

export type StatsPeriod = "week" | "month" | "all"

export interface SummaryRow {
  total_plays: number
  unique_songs: number
  unique_artists: number
  biggest_day: string | null
  biggest_day_count: number | null
  total_seconds: number
}

export interface ListenerRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  play_count: number
}

export interface ArtistRow {
  artist: string
  play_count: number
}

export interface SongCountRow {
  song_id: string
  play_count: number
}

export interface DailyRow {
  day: string
  play_count: number
}

export interface RegionRow {
  regiao: string
  nucleo: string | null
  play_count: number
}

export interface RegionUserRow {
  regiao: string
  nucleo: string | null
  user_count: number
}

export interface WeeklySongRow {
  week_start: string
  song_id: string
  rank: number
  play_count: number
}

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

function useRpc<T>(
  enabled: boolean,
  fetcher: () => Promise<{ data: T | null; error: { message: string } | null }>,
  deps: React.DependencyList
): FetchState<T> {
  const [state, setState] = React.useState<FetchState<T>>({
    data: null,
    loading: enabled,
    error: null,
  })
  const fetcherRef = React.useRef(fetcher)
  React.useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  React.useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: null, loading: false, error: null })
      return
    }
    let cancelled = false
    const run = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      const { data, error } = await fetcherRef.current()
      if (cancelled) return
      if (error) {
        setState({ data: null, loading: false, error: error.message })
        return
      }
      setState({ data, loading: false, error: null })
    }
    void run()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return state
}

export function useStatsSummary(period: StatsPeriod) {
  return useRpc<SummaryRow>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_summary", { period })
    if (error) return { data: null, error }
    return { data: (data?.[0] ?? null) as SummaryRow | null, error: null }
  }, [period])
}

export function useTopListeners(period: StatsPeriod, lim = 10) {
  return useRpc<ListenerRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_top_listeners", {
      period,
      lim,
    })
    if (error) return { data: null, error }
    return { data: (data ?? []) as ListenerRow[], error: null }
  }, [period, lim])
}

export function useTopArtists(days: number | null, lim = 10) {
  return useRpc<ArtistRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_top_artists", {
      days,
      lim,
    })
    if (error) return { data: null, error }
    return { data: (data ?? []) as ArtistRow[], error: null }
  }, [days, lim])
}

export function usePlaysPerDay(days = 30) {
  return useRpc<DailyRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_plays_per_day", { days })
    if (error) return { data: null, error }
    return { data: (data ?? []) as DailyRow[], error: null }
  }, [days])
}

export function useTopSongs(period: StatsPeriod, lim = 10) {
  return useRpc<SongCountRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_top_songs", {
      period,
      lim,
    })
    if (error) return { data: null, error }
    return { data: (data ?? []) as SongCountRow[], error: null }
  }, [period, lim])
}

export function useListenersByRegion(period: StatsPeriod, lim = 10) {
  return useRpc<RegionRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_listeners_by_region", {
      period,
      lim,
    })
    if (error) return { data: null, error }
    return { data: (data ?? []) as RegionRow[], error: null }
  }, [period, lim])
}

export function useUsersByRegion(lim = 10) {
  return useRpc<RegionUserRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_users_by_region", { lim })
    if (error) return { data: null, error }
    return { data: (data ?? []) as RegionUserRow[], error: null }
  }, [lim])
}

export function useTopSongsWeekly(weeksBack = 8) {
  return useRpc<WeeklySongRow[]>(supabaseConfigured, async () => {
    if (!supabase) return { data: null, error: null }
    const { data, error } = await supabase.rpc("stats_top_songs_weekly", {
      weeks_back: weeksBack,
    })
    if (error) return { data: null, error }
    return { data: (data ?? []) as WeeklySongRow[], error: null }
  }, [weeksBack])
}
