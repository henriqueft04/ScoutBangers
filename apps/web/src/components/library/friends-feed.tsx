import * as React from "react"
import { Loader2, Play } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { useInView } from "@/hooks/useInView"
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

/**
 * Recent plays from everyone, joined to the local song catalog so we
 * can render titles + artwork. Pulls from the `recent_plays` Supabase
 * RPC (granted to anon so the feed renders pre-sign-in).
 *
 * Refreshes on visibilitychange and when the playing song changes so
 * the feed stays warm without a hard refresh.
 */
export function FriendsFeed() {
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
          displayName: row.display_name ?? "Someone",
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

  // Resolve song metadata from local catalog.
  const songsById = React.useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs]
  )

  if (!supabaseConfigured) return null

  const handlePlay = (songId: string) => {
    const indexInAll = songs.findIndex((s) => s.id === songId)
    if (indexInAll !== -1) play(indexInAll)
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h3 className="text-foreground text-lg font-semibold tracking-tight">
          Friends
        </h3>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          Recently played
        </p>
      </header>

      {loading ? (
        <div className="text-muted-foreground py-4 text-center">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nobody's listened yet. Be the first.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-px">
          {entries.map((entry, index) => (
            <li key={`${entry.userId}-${entry.songId}-${entry.playedAt}-${index}`}>
              <FeedRow
                entry={entry}
                song={songsById.get(entry.songId)}
                onPlay={handlePlay}
              />
            </li>
          ))}
        </ul>
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
  const [ref, inView] = useInView<HTMLDivElement>()
  const meta = useTrackMetadata(entry.songId, inView && Boolean(song))
  const title = song ? displayTitle(song, meta) : "Unavailable"
  const playable = Boolean(song)
  const initials = entry.displayName.charAt(0).toUpperCase()

  return (
    <div
      ref={ref}
      role={playable ? "button" : undefined}
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
      aria-label={playable ? `Play ${title}` : undefined}
      className={cn(
        "group/feed flex items-center gap-3 rounded-md px-2 py-2 transition-colors",
        playable
          ? "hover:bg-muted active:bg-accent cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none touch-manipulation"
          : "opacity-60"
      )}
    >
      <div className="bg-primary text-primary-foreground inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
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
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm">
          <span className="font-semibold">{entry.displayName}</span>
          <span className="text-muted-foreground"> played</span>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <span className="text-foreground">{title}</span>
          <span> · {relativeTime(entry.playedAt)}</span>
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
