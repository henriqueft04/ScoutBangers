import { Pause, Play } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { useInView } from "@/hooks/useInView"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import type { Song } from "@/lib/types"

import { SongArtwork } from "./song-artwork"

interface SongRowProps {
  song: Song
  index: number
  isCurrent: boolean
  isPlaying: boolean
  onPlay: (index: number) => void
}

/**
 * One row in the library list. The whole row is a single button so the entire
 * area is tappable on mobile (good for fat fingers + touch-action: manipulation
 * removes the iOS 300ms tap delay).
 *
 * Embedded tags (artwork + artist if missing from filename) are loaded lazily
 * once the row scrolls into view.
 */
export function SongRow({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
}: SongRowProps) {
  const [ref, inView] = useInView<HTMLButtonElement>()
  const meta = useTrackMetadata(song.id, inView)

  const Icon = isCurrent && isPlaying ? Pause : Play
  const artist = song.artist ?? meta?.artist
  const title = song.title || meta?.title || "Untitled"

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onPlay(index)}
      data-current={isCurrent || undefined}
      aria-label={
        isCurrent && isPlaying ? `Pause ${title}` : `Play ${title}`
      }
      className={cn(
        "group/row flex w-full touch-manipulation items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        "hover:bg-muted active:bg-accent",
        "focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
        "data-[current]:bg-accent",
        "min-h-14 md:min-h-12"
      )}
    >
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
        <p
          className={cn(
            "truncate text-sm font-medium",
            isCurrent ? "text-primary" : "text-foreground"
          )}
        >
          {title}
        </p>
        {artist && (
          <p className="text-muted-foreground truncate text-xs">{artist}</p>
        )}
      </div>
    </button>
  )
}
