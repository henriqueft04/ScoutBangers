import * as React from "react"

import { EmptyState } from "@/components/library/empty-state"
import { SongList } from "@/components/library/song-list"
import { usePlayer } from "@/hooks/usePlayer"
import { supabase, supabaseConfigured } from "@/lib/supabase"
import type { Song } from "@/lib/types"

interface RankedSong extends Song {
  playCount: number
}

/**
 * Home tab — global top-10 most-played songs.
 *
 * Pulls aggregated counts from Supabase's `top_songs_global` RPC and joins
 * them against the local song catalog so titles/artists/artwork still come
 * from Drive metadata. Anonymous reads are allowed (the function is granted
 * to the `anon` role), so this works pre-sign-in.
 *
 * Falls back to "first 10 by default sort order" when Supabase is not
 * configured (so the home tab still renders something during development).
 */
export function HomePage() {
  const { songs, currentIndex, isPlaying, play, loading } = usePlayer()
  const [ranked, setRanked] = React.useState<RankedSong[] | null>(null)
  const [rpcError, setRpcError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    if (songs.length === 0) return
    let cancelled = false

    void (async () => {
      const { data, error } = await supabase.rpc("top_songs_global", { lim: 10 })
      if (cancelled) return
      if (error) {
        setRpcError(error.message)
        return
      }
      const byId = new Map(songs.map((song) => [song.id, song]))
      const out: RankedSong[] = []
      for (const row of data ?? []) {
        const song = byId.get(row.song_id)
        if (song) out.push({ ...song, playCount: Number(row.play_count) })
      }
      setRanked(out)
    })()

    return () => {
      cancelled = true
    }
  }, [songs])

  // Fallback: first 10 songs in whatever order the catalog provides.
  const display: RankedSong[] = React.useMemo(() => {
    if (ranked && ranked.length > 0) return ranked
    return songs.slice(0, 10).map((song) => ({ ...song, playCount: 0 }))
  }, [ranked, songs])

  const playFromRanked = (index: number) => {
    const song = display[index]
    if (!song) return
    const indexInAll = songs.findIndex((s) => s.id === song.id)
    if (indexInAll !== -1) play(indexInAll)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Top 10
        </h2>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          Most played
        </p>
      </header>

      {loading && songs.length === 0 ? (
        <EmptyState variant="loading" />
      ) : display.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            rpcError
              ? `Couldn't load top tracks: ${rpcError}`
              : ranked === null && !supabaseConfigured
              ? "Showing the catalog. Top-10 ranking activates once Supabase is configured."
              : "No plays recorded yet — start listening to populate the chart."
          }
        />
      ) : (
        <SongList
          songs={display}
          currentIndex={
            currentIndex !== null
              ? display.findIndex((s) => s.id === songs[currentIndex]?.id)
              : null
          }
          isPlaying={isPlaying}
          onPlay={playFromRanked}
        />
      )}
    </div>
  )
}
