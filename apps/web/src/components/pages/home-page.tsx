import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "@workspace/ui/lib/utils"

import { EmptyState } from "@/components/library/empty-state"
import { FriendsFeed } from "@/components/library/friends-feed"
import { SongRow } from "@/components/library/song-row"
import { usePlayer } from "@/hooks/usePlayer"
import { newestFirst } from "@/lib/sort"
import { getCached, setCached } from "@/lib/storage"
import { supabaseConfigured } from "@/lib/supabase"
import {
  fetchChart,
  peekChart,
  type ChartPeriod,
  type ChartRow,
} from "@/lib/top-songs-cache"
import type { Song } from "@/lib/types"

interface RankedSong extends Song {
  /** Absent in the "Novas" list, which is not a ranking. */
  playCount?: number
  rank?: number
}

/**
 * Which plays the chart counts. `week` is the same week as the stats page's
 * "Esta semana" and the weekly listener badges: the ISO week starting Monday
 * 00:00 UTC (migrations 0028/0029). It keeps the home page from only ever
 * showing the songs that are already famous, because every Monday new songs
 * get a shot. `new` isn't a chart at all: the catalog, newest additions first.
 */
type Period = "week" | "all" | "new"

const PERIODS: { value: Period; label: string; caption: string }[] = [
  { value: "week", label: "Semana", caption: "Mais ouvidas esta semana" },
  { value: "all", label: "Sempre", caption: "Mais ouvidas de sempre" },
  { value: "new", label: "Novas", caption: "Adicionadas recentemente" },
]
const DEFAULT_PERIOD: Period = "week"
const PERIOD_KEY = "scoutbangers:home-top-period"
const PERIOD_TTL_MS = 365 * 24 * 60 * 60 * 1000

function readStoredPeriod(): Period {
  const stored = getCached<Period>(PERIOD_KEY)
  return PERIODS.some((p) => p.value === stored) ? stored! : DEFAULT_PERIOD
}

/** Joins chart rows with the local catalog, numbering the songs we have. */
function toRanked(rows: ChartRow[], byId: Map<string, Song>): RankedSong[] {
  const out: RankedSong[] = []
  for (const row of rows) {
    const song = byId.get(row.song_id)
    if (song) {
      out.push({ ...song, playCount: row.play_count, rank: out.length + 1 })
    }
  }
  return out
}

/**
 * Home tab — top-20 most-played songs with rank + play count, for this
 * week (default) or of all time, or the 20 most recently added songs.
 * The charts pull from Supabase's `stats_top_songs` RPC (granted to anon,
 * so this works pre-sign-in) and join against the local song catalog so
 * titles and artwork come from Drive metadata. "Novas" needs no query: it
 * sorts the catalog we already have.
 */
export function HomePage() {
  const { songs, currentIndex, isPlaying, play, loading } = usePlayer()
  const [period, setPeriod] = React.useState<Period>(readStoredPeriod)
  // What each chart last returned. Seeded from the shared cache, so coming
  // back to this tab — or flipping between charts — shows the previous list
  // instantly while a fresh one loads, instead of an empty wait.
  const [charts, setCharts] = React.useState<
    Partial<Record<ChartPeriod, ChartRow[]>>
  >(() => ({ week: peekChart("week"), all: peekChart("all") }))
  const [rpcError, setRpcError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<10 | 15 | 20>(10)
  // Tick changes when the playing song changes — used to refresh the chart
  // so it follows what the user listens to without leaving the page. The
  // cache decides whether that is worth a request (see CHART_MAX_AGE_MS).
  const songIdKey = currentIndex !== null ? songs[currentIndex]?.id ?? "" : ""

  const keepChart = React.useCallback(
    (target: ChartPeriod, rows: ChartRow[]) =>
      setCharts((prev) =>
        prev[target] === rows ? prev : { ...prev, [target]: rows },
      ),
    [],
  )

  React.useEffect(() => {
    if (period === "new" || !supabaseConfigured) return
    let cancelled = false

    const refresh = () => {
      fetchChart(period).then(
        (rows) => {
          if (cancelled) return
          setRpcError(null)
          keepChart(period, rows)
        },
        (error: Error) => {
          if (!cancelled) setRpcError(error.message)
        },
      )
    }

    refresh()

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [period, songIdKey, keepChart])

  const choosePeriod = (next: Period) => {
    setPeriod(next)
    setCached(PERIOD_KEY, next, PERIOD_TTL_MS)
  }

  // Start the request as soon as a tap or click is likely, so most of the
  // network wait is already over when the choice lands. Silent: a failure
  // here just means the real request happens on the click.
  const prefetch = (target: Period) => {
    if (target === "new" || !supabaseConfigured) return
    fetchChart(target).then((rows) => keepChart(target, rows), () => undefined)
  }

  const byId = React.useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs],
  )
  const rows = period === "new" ? undefined : charts[period]
  const topForPeriod = React.useMemo(
    () => (rows ? toRanked(rows, byId) : null),
    [rows, byId],
  )
  const topLoading =
    period !== "new" && supabaseConfigured && !rows && !rpcError

  const newest: RankedSong[] = React.useMemo(
    () => newestFirst(songs).slice(0, 20),
    [songs],
  )

  const full: RankedSong[] = React.useMemo(() => {
    if (period === "new") return newest
    if (topForPeriod && topForPeriod.length > 0) return topForPeriod
    // Nothing yet: wait for the chart rather than flashing the catalog with
    // zero plays and then swapping it for the real one.
    if (topLoading) return []
    // A week nobody has listened in yet is empty — not the catalog dressed
    // up as a chart.
    if (period === "week" && supabaseConfigured) return []
    return songs.slice(0, 20).map((song, index) => ({
      ...song,
      playCount: 0,
      rank: index + 1,
    }))
  }, [topForPeriod, topLoading, period, songs, newest])

  const display: RankedSong[] = React.useMemo(
    () => full.slice(0, limit),
    [limit, full],
  )

  const handlePlay = (index: number) => {
    const song = display[index]
    if (!song) return
    const indexInAll = songs.findIndex((s) => s.id === song.id)
    if (indexInAll === -1) return
    // Context: the FULL top-20 in rank order (not just whatever's
    // currently visible under the "Mostrar mais" limit — a click while
    // collapsed to Top 10 should still queue ranks 11-20 next, in rank
    // order, rather than dropping them into the general library
    // alphabetical order), then the rest of the library so the queue
    // continues naturally after the chart ends.
    const topIds = full.map((s) => s.id)
    const topSet = new Set(topIds)
    const rest = songs.filter((s) => !topSet.has(s.id)).map((s) => s.id)
    play(indexInAll, [...topIds, ...rest])
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <div className="xl:hidden">
        <FriendsFeed />
      </div>

      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            {period === "new" ? "Novidades" : `Top ${limit}`}
          </h2>
          <div role="group" aria-label="Período do top" className="flex gap-1">
            {PERIODS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onPointerEnter={() => prefetch(value)}
                onPointerDown={() => prefetch(value)}
                onFocus={() => prefetch(value)}
                onClick={() => choosePeriod(value)}
                className={cn(
                  "touch-manipulation rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors",
                  period === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground border-primary hover:border-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          {PERIODS.find((p) => p.value === period)?.caption}
        </p>
      </header>

      {loading && songs.length === 0 ? (
        <EmptyState variant="loading" />
      ) : display.length === 0 && topLoading ? (
        <EmptyState variant="loading" />
      ) : display.length === 0 ? (
        <EmptyState
          variant="empty"
          message={
            period === "new"
              ? "Ainda não há músicas no catálogo."
              : rpcError
              ? `Não foi possível carregar o top: ${rpcError}`
              : !supabaseConfigured
              ? "A mostrar o catálogo. O top só fica ativo quando o Supabase estiver configurado."
              : period === "week"
              ? "Ainda ninguém ouviu nada esta semana — começa a ouvir para abrir o top."
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
