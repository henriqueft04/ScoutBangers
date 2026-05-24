import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import { EmptyState } from "@/components/library/empty-state"
import { FriendsFeed } from "@/components/library/friends-feed"
import { SongRow } from "@/components/library/song-row"
import { usePlayer } from "@/hooks/usePlayer"
import { supabase, supabaseConfigured } from "@/lib/supabase"
import type { Song } from "@/lib/types"

interface RankedSong extends Song {
  playCount: number
  rank: number
}

/**
 * Home tab — global top-20 most-played songs with rank + play count.
 * Pulls from Supabase's `top_songs_global` RPC (granted to anon, so this
 * works pre-sign-in) and joins against the local song catalog so titles
 * and artwork come from Drive metadata.
 */
export function HomePage() {
  const { songs, currentIndex, isPlaying, play, loading } = usePlayer()
  const [ranked, setRanked] = React.useState<RankedSong[] | null>(null)
  const [rpcError, setRpcError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<10 | 15 | 20>(10)
  // Tick changes when the playing song changes — used to refresh top-10
  // counts so the chart updates as the user listens without leaving the page.
  const songIdKey = currentIndex !== null ? songs[currentIndex]?.id ?? "" : ""

  React.useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    if (songs.length === 0) return
    let cancelled = false

    const fetchTop = async () => {
      if (!supabase) return
      const { data, error } = await supabase.rpc("top_songs_global", { lim: 20 })
      if (cancelled) return
      if (error) {
        setRpcError(error.message)
        return
      }
      const byId = new Map(songs.map((song) => [song.id, song]))
      const out: RankedSong[] = []
      let rank = 1
      for (const row of data ?? []) {
        const song = byId.get(row.song_id)
        if (song) {
          out.push({ ...song, playCount: Number(row.play_count), rank })
          rank += 1
        }
      }
      setRanked(out)
    }

    void fetchTop()

    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchTop()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [songs, songIdKey])

  const full: RankedSong[] = React.useMemo(() => {
    if (ranked && ranked.length > 0) return ranked
    return songs.slice(0, 20).map((song, index) => ({
      ...song,
      playCount: 0,
      rank: index + 1,
    }))
  }, [ranked, songs])

  const display: RankedSong[] = React.useMemo(
    () => full.slice(0, limit),
    [limit, full],
  )

  const handlePlay = (index: number) => {
    const song = display[index]
    if (!song) return
    const indexInAll = songs.findIndex((s) => s.id === song.id)
    if (indexInAll === -1) return
    // Context: the visible top in rank order, then the rest of the library
    // (skipping any songs already counted in the top) so the queue
    // continues naturally after the chart ends.
    const topIds = display.map((s) => s.id)
    const topSet = new Set(topIds)
    const rest = songs.filter((s) => !topSet.has(s.id)).map((s) => s.id)
    play(indexInAll, [...topIds, ...rest])
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <div className="xl:hidden">
        <FriendsFeed />
      </div>

      <header className="flex items-baseline justify-between">
        <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Top {limit}
        </h2>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          Mais ouvidas
        </p>
      </header>

      {loading && songs.length === 0 ? (
        <EmptyState variant="loading" />
      ) : display.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            rpcError
              ? `Não foi possível carregar o top: ${rpcError}`
              : ranked === null && !supabaseConfigured
              ? "A mostrar o catálogo. O top só fica ativo quando o Supabase estiver configurado."
              : "Ainda não há reproduções registadas — começa a ouvir para alimentar o top."
          }
        />
      ) : (
        <>
          <ul role="list" className="flex flex-col gap-px py-1">
            <AnimatePresence initial={false}>
              {display.map((song, index) => (
                <motion.li
                  key={song.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <SongRow
                    song={song}
                    index={index}
                    rank={song.rank}
                    playCount={song.playCount}
                    isCurrent={
                      currentIndex !== null &&
                      songs[currentIndex]?.id === song.id
                    }
                    isPlaying={isPlaying}
                    onPlay={handlePlay}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {full.length > 10 && (
            <div className="flex justify-center gap-4">
              {limit < 20 && full.length > limit && (
                <button
                  type="button"
                  onClick={() =>
                    setLimit((v) => (v === 10 ? 15 : 20))
                  }
                  className="text-muted-foreground hover:text-foreground rounded-full border border-red-300/60 px-3 py-1 text-xs uppercase tracking-wider transition-colors hover:border-red-300"
                >
                  Mostrar mais
                </button>
              )}
              {limit > 10 && (
                <button
                  type="button"
                  onClick={() => setLimit((v) => (v === 20 ? 15 : 10))}
                  className="text-muted-foreground hover:text-foreground rounded-full border border-red-300/60 px-3 py-1 text-xs uppercase tracking-wider transition-colors hover:border-red-300"
                >
                  Mostrar menos
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
