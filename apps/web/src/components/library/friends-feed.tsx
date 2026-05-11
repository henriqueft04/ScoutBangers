import * as React from "react"
import { BarChart3, Loader2, Play } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { displayTitle } from "@/lib/song-display"
import { relativeTime } from "@/lib/relative-time"
import { supabase, supabaseConfigured } from "@/lib/supabase"
import type { Song } from "@/lib/types"

interface FeedEntry {
  songId: string
  userId: string
  displayName: string
  avatarUrl: string | null
  playedAt: string
}

interface FriendsFeedProps {
  /**
   * `carousel` (default): 2-row horizontal scroller used inline on Home.
   * `rail`: single-column vertical list for the desktop right sidebar.
   */
  variant?: "carousel" | "rail"
  className?: string
}

/**
 * Recent plays from everyone. Default is a 2-row horizontal carousel
 * inline on Home; the `rail` variant stacks cards vertically for the
 * desktop right sidebar.
 */
export function FriendsFeed({ variant = "carousel", className }: FriendsFeedProps = {}) {
  const { songs, play } = usePlayer()
  const [entries, setEntries] = React.useState<FeedEntry[] | null>(null)
  const [loading, setLoading] = React.useState(supabaseConfigured)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    let cancelled = false

    const fetchFeed = async () => {
      if (!supabase) return
      const { data, error } = await supabase.rpc("recent_plays", { lim: 30 })
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setEntries(
        (data ?? []).map((row) => ({
          songId: row.song_id,
          userId: row.user_id,
          displayName: row.display_name ?? "Alguém",
          avatarUrl: row.avatar_url,
          playedAt: row.played_at,
        }))
      )
      setLoading(false)
    }

    void fetchFeed()

    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchFeed()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const songsById = React.useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs]
  )

  if (!supabaseConfigured) return null

  const handlePlay = (songId: string) => {
    const indexInAll = songs.findIndex((s) => s.id === songId)
    if (indexInAll !== -1) play(indexInAll)
  }

  const isRail = variant === "rail"

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-foreground text-lg font-semibold tracking-tight">
          Amigos
        </h3>
        {isRail ? (
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            Recente
          </p>
        ) : (
          <Link
            to="/estatisticas"
            className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors touch-manipulation"
          >
            <BarChart3 className="size-3.5" aria-hidden />
            Ver estatísticas
          </Link>
        )}
      </header>

      {loading ? (
        <div className="text-muted-foreground py-4 text-center">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ainda não há atividade dos amigos — convida uns para ouvirem.
        </p>
      ) : isRail ? (
        <div role="list" className="flex flex-col gap-1">
          {entries.map((entry, index) => (
            <FeedRow
              key={`${entry.userId}-${entry.songId}-${entry.playedAt}-${index}`}
              entry={entry}
              song={songsById.get(entry.songId)}
              onPlay={handlePlay}
            />
          ))}
        </div>
      ) : (
        <div
          role="list"
          className="-mx-3 grid auto-cols-[16rem] grid-flow-col grid-rows-2 gap-2 overflow-x-auto px-3 pb-2 snap-x snap-mandatory md:-mx-6 md:auto-cols-[18rem] md:px-6"
        >
          {entries.map((entry, index) => (
            <FeedRow
              key={`${entry.userId}-${entry.songId}-${entry.playedAt}-${index}`}
              entry={entry}
              song={songsById.get(entry.songId)}
              onPlay={handlePlay}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface FeedRowProps {
  entry: FeedEntry
  song: Song | undefined
  onPlay: (songId: string) => void
}

function FeedRow({ entry, song, onPlay }: FeedRowProps) {
  const { ref, meta } = useTrackVisuals<HTMLDivElement>(
    entry.songId,
    Boolean(song),
    song?.modifiedTime
  )
  const title = song ? displayTitle(song, meta) : "Indisponível"
  const playable = Boolean(song)
  const initials = entry.displayName.charAt(0).toUpperCase()

  return (
    <div
      ref={ref}
      role={playable ? "button" : "listitem"}
      tabIndex={playable ? 0 : undefined}
      onClick={playable ? () => onPlay(entry.songId) : undefined}
      onKeyDown={
        playable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onPlay(entry.songId)
              }
            }
          : undefined
      }
      aria-label={playable ? `Reproduzir ${title}` : undefined}
      className={cn(
        "group/feed border-primary/30 flex snap-start items-center gap-3 rounded-md border px-2 py-2 transition-colors",
        playable
          ? "hover:bg-muted active:bg-accent cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none touch-manipulation"
          : "opacity-60"
      )}
    >
      <Link
        to={`/u/${entry.userId}`}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Abrir o perfil de ${entry.displayName}`}
        className="bg-primary text-primary-foreground inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
      >
        {entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm">
          <Link
            to={`/u/${entry.userId}`}
            onClick={(event) => event.stopPropagation()}
            className="font-semibold hover:underline"
          >
            {entry.displayName}
          </Link>
          <span className="text-muted-foreground"> · {relativeTime(entry.playedAt)}</span>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <span className="text-foreground">{title}</span>
        </p>
      </div>
      {playable ? (
        <Play
          className="text-muted-foreground group-hover/feed:text-primary size-4 shrink-0 fill-current opacity-0 group-hover/feed:opacity-100"
          aria-hidden
        />
      ) : null}
    </div>
  )
}
