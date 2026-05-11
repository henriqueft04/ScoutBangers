import * as React from "react"
import { Pause, Play } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { TrackArtwork } from "@/components/library/track-artwork"
import { usePlayer } from "@/hooks/usePlayer"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { displayArtist, displayTitle } from "@/lib/song-display"
import type { Song } from "@/lib/types"

import type { SongCountRow } from "@/hooks/useStats"

interface TopSongsProps {
  rows: SongCountRow[] | null
  loading: boolean
  songsById: Map<string, Song>
}

const numberFmt = new Intl.NumberFormat("pt-PT")

/**
 * Leaderboard of the most-played songs in the period. Click a row to
 * play. Bar fill is proportional to play count so the gap between #1
 * and the rest is immediately visible.
 */
export function TopSongs({ rows, loading, songsById }: TopSongsProps) {
  if (loading) {
    return (
      <ol className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="bg-muted h-14 animate-pulse rounded-md"
            aria-hidden
          />
        ))}
      </ol>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground border-border bg-card rounded-md border px-4 py-6 text-center text-sm">
        Sem reproduções neste período.
      </p>
    )
  }

  const max = rows[0]?.play_count ?? 1

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <SongLeaderRow
          key={row.song_id}
          row={row}
          rank={index + 1}
          max={max}
          song={songsById.get(row.song_id)}
        />
      ))}
    </ol>
  )
}

interface SongLeaderRowProps {
  row: SongCountRow
  rank: number
  max: number
  song: Song | undefined
}

function SongLeaderRow({ row, rank, max, song }: SongLeaderRowProps) {
  const { songs, currentIndex, isPlaying, play, toggle } = usePlayer()
  const { ref, meta } = useTrackVisuals<HTMLLIElement>(
    row.song_id,
    Boolean(song),
    song?.modifiedTime
  )

  const playable = Boolean(song)
  const title = song ? displayTitle(song, meta) : "(música indisponível)"
  const artist = song ? displayArtist(song, meta) : null
  const isCurrent =
    currentIndex !== null && songs[currentIndex]?.id === row.song_id
  const Icon = isCurrent && isPlaying ? Pause : Play
  const pct = (row.play_count / max) * 100

  const handleActivate = () => {
    if (!playable) return
    if (isCurrent) {
      toggle()
      return
    }
    const i = songs.findIndex((s) => s.id === row.song_id)
    if (i !== -1) play(i)
  }

  return (
    <li
      ref={ref}
      className={cn(
        "border-border bg-card relative overflow-hidden rounded-md border",
        isCurrent && "border-primary/40"
      )}
    >
      <div
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute inset-y-0 left-0"
        style={{ width: `${pct}%` }}
      />
      <button
        type="button"
        disabled={!playable}
        onClick={handleActivate}
        className={cn(
          "relative z-10 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
          playable
            ? "hover:bg-muted/40 cursor-pointer touch-manipulation"
            : "cursor-not-allowed opacity-60"
        )}
      >
        <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums">
          {rank}
        </span>
        <span className="size-10 shrink-0 overflow-hidden rounded">
          <TrackArtwork meta={meta} className="size-full" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-medium">
            {title}
          </span>
          {artist ? (
            <span className="text-muted-foreground block truncate text-xs">
              {artist}
            </span>
          ) : null}
        </span>
        <span className="text-foreground shrink-0 text-sm tabular-nums">
          {numberFmt.format(row.play_count)}
          <span className="text-muted-foreground ml-1 text-xs">
            reproduções
          </span>
        </span>
        {playable ? (
          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        ) : null}
      </button>
    </li>
  )
}
