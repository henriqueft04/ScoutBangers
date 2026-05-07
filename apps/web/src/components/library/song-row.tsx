import { Pause, Play } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { SongArtwork } from "./song-artwork"
import type { Song } from "@/lib/types"

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
 */
export function SongRow({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
}: SongRowProps) {
  const Icon = isCurrent && isPlaying ? Pause : Play
  return (
    <button
      type="button"
      onClick={() => onPlay(index)}
      data-current={isCurrent || undefined}
      aria-label={
        isCurrent && isPlaying
          ? `Pause ${song.title}`
          : `Play ${song.title}`
      }
      className={cn(
        "group/row flex w-full touch-manipulation items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        "hover:bg-muted active:bg-accent",
        "focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
        "data-[current]:bg-accent",
        "min-h-14 md:min-h-12"
      )}
    >
      <div className="relative">
        <SongArtwork className="size-10 md:size-11" />
        <span
          className={cn(
            "bg-foreground/40 pointer-events-none absolute inset-0 hidden items-center justify-center rounded-md text-primary-foreground",
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
          {song.title}
        </p>
        {song.artist && (
          <p className="text-muted-foreground truncate text-xs">
            {song.artist}
          </p>
        )}
      </div>
    </button>
  )
}
