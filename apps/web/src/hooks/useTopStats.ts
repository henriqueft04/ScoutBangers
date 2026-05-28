import * as React from "react"

import { usePlayer } from "@/hooks/usePlayer"
import { supabase } from "@/lib/supabase"

export interface UserListeningStats {
  totalSeconds: number
  totalPlays: number
}

export function useUserListeningStats(
  userId: string | null | undefined,
  options: { refetchOnVisibility?: boolean } = {}
): UserListeningStats | null {
  const { refetchOnVisibility = false } = options
  const [stats, setStats] = React.useState<UserListeningStats | null>(null)

  React.useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    const sb = supabase

    const run = async () => {
      const { data, error } = await sb.rpc("stats_for_user", { uid: userId })
      if (cancelled || error || !data?.[0]) return
      setStats({
        totalSeconds: Number(data[0].total_seconds),
        totalPlays: Number(data[0].total_plays),
      })
    }

    void run()

    if (refetchOnVisibility) {
      const onVisibility = () => {
        if (document.visibilityState === "visible") void run()
      }
      document.addEventListener("visibilitychange", onVisibility)
      return () => {
        cancelled = true
        document.removeEventListener("visibilitychange", onVisibility)
      }
    }

    return () => { cancelled = true }
  }, [userId, refetchOnVisibility])

  return stats
}

export interface TopSong {
  id: string
  title: string
  playCount: number
}

export interface TopArtist {
  name: string
  playCount: number
}

interface UseTopStatsOptions {
  /** Re-fetch when the tab becomes visible again. The personal profile
   *  uses this so the user sees fresh stats after listening; the public
   *  view doesn't bother. */
  refetchOnVisibility?: boolean
}

interface UseTopStatsResult {
  topSongs: TopSong[] | null
  topArtists: TopArtist[] | null
}

/**
 * Fetch a user's top 5 songs + top 5 artists via the corresponding
 * Postgres functions. Returns `null` while loading. Song rows are
 * filtered against the player's loaded catalog so we can show titles
 * (the RPC only knows ids).
 */
export function useTopStats(
  userId: string | null | undefined,
  options: UseTopStatsOptions = {}
): UseTopStatsResult {
  const { refetchOnVisibility = false } = options
  const { songs } = usePlayer()
  const [topSongs, setTopSongs] = React.useState<TopSong[] | null>(null)
  const [topArtists, setTopArtists] = React.useState<TopArtist[] | null>(null)

  React.useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    const sb = supabase

    const fetchStats = async () => {
      const [songsRes, artistsRes] = await Promise.all([
        sb.rpc("top_songs_for_user", { uid: userId, lim: 5 }),
        sb.rpc("top_artists_for_user", { uid: userId, lim: 5 }),
      ])
      if (cancelled) return

      if (!songsRes.error && songsRes.data) {
        const byId = new Map(songs.map((s) => [s.id, s]))
        setTopSongs(
          songsRes.data
            .map((row) => {
              const song = byId.get(row.song_id)
              return song
                ? {
                    id: song.id,
                    title: song.title,
                    playCount: Number(row.play_count),
                  }
                : null
            })
            .filter((row): row is TopSong => row !== null)
        )
      } else if (songsRes.error) {
        setTopSongs([])
      }

      if (!artistsRes.error && artistsRes.data) {
        setTopArtists(
          artistsRes.data.map((row) => ({
            name: row.artist,
            playCount: Number(row.play_count),
          }))
        )
      } else if (artistsRes.error) {
        setTopArtists([])
      }
    }

    void fetchStats()

    if (refetchOnVisibility) {
      const onVisibility = () => {
        if (document.visibilityState === "visible") void fetchStats()
      }
      document.addEventListener("visibilitychange", onVisibility)
      return () => {
        cancelled = true
        document.removeEventListener("visibilitychange", onVisibility)
      }
    }

    return () => {
      cancelled = true
    }
  }, [userId, songs, refetchOnVisibility])

  return { topSongs, topArtists }
}
