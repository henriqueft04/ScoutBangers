import * as React from "react"
import { Pause, Play } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@workspace/ui/lib/utils"

import { useInView } from "@/hooks/useInView"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { artistHref } from "@/lib/artists"
import { displayArtist, displayTitle } from "@/lib/song-display"
import type { Song } from "@/lib/types"

import { FavoriteButton } from "./favorite-button"
import { MarqueeText } from "./marquee-text"
import { SongArtwork } from "./song-artwork"

interface SongRowProps {
  song: Song
  index: number
  isCurrent: boolean
  isPlaying: boolean
  onPlay: (index: number) => void
  /** When set, shown as a numeric badge on the left (e.g. for top-10 lists). */
  rank?: number
  /** When set, replaces the artist line with "N plays" — used on the home top-10. */
  playCount?: number
}

/**
 * One row in the library list. The whole row triggers playback; the artist
 * sub-link navigates to the artist page when present (clicks on the link
 * stop propagation so they don't also start playback).
 *
 * Implemented as `role="button"` rather than a `<button>` element so we can
 * legally nest a `<Link>` for the artist — `<a>` inside `<button>` is invalid
 * HTML. Keyboard activation is wired explicitly to keep this accessible.
 *
 * Embedded tags (artwork + artist + tag-title) are loaded lazily once the
 * row scrolls into view. The marquee animation only runs on the currently-
 * playing row to keep big lists calm.
 */
export function SongRow({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  rank,
  playCount,
}: SongRowProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const meta = useTrackMetadata(song.id, inView)

  const Icon = isCurrent && isPlaying ? Pause : Play
  const title = displayTitle(song, meta)
  const artist = displayArtist(song, meta)

  const handleActivate = React.useCallback(() => {
    onPlay(index)
  }, [onPlay, index])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        handleActivate()
      }
    },
    [handleActivate]
  )

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      data-current={isCurrent || undefined}
      aria-label={
        isCurrent && isPlaying ? `Pause ${title}` : `Play ${title}`
      }
      className={cn(
        "group/row flex w-full touch-manipulation cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        "hover:bg-muted active:bg-accent",
        "focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
        "data-[current]:bg-accent",
        "min-h-14 md:min-h-12"
      )}
    >
      {rank !== undefined ? (
        <span
          aria-hidden
          className={cn(
            "w-5 shrink-0 text-center text-base font-semibold tabular-nums md:w-6",
            isCurrent ? "text-primary" : "text-muted-foreground"
          )}
        >
          {rank}
        </span>
      ) : null}
      <div className="relative size-10 shrink-0 md:size-11">
        {meta?.pictureUrl ? (
          <img
            src={meta.pictureUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full rounded-md object-cover"
          />
        ) : (
          <SongArtwork className="size-full" />
        )}
        <span
          className={cn(
            "bg-foreground/40 text-primary-foreground pointer-events-none absolute inset-0 hidden items-center justify-center rounded-md",
            "group-hover/row:flex group-data-[current]/row:flex"
          )}
        >
          <Icon className="size-4 fill-current" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <MarqueeText
          enabled={isCurrent}
          className={cn(
            "text-sm font-medium",
            isCurrent ? "text-primary" : "text-foreground"
          )}
        >
          {title}
        </MarqueeText>
        {playCount !== undefined ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {playCount.toLocaleString()}{" "}
            {playCount === 1 ? "play" : "plays"}
          </p>
        ) : artist ? (
          <Link
            to={artistHref(artist)}
            onClick={(event) => event.stopPropagation()}
            className="text-muted-foreground hover:text-foreground inline-block max-w-full truncate text-xs hover:underline"
          >
            {artist}
          </Link>
        ) : null}
      </div>
      <FavoriteButton songId={song.id} size="sm" />
    </div>
  )
}
