import { usePlayer } from "@/hooks/usePlayer"
import { cn } from "@workspace/ui/lib/utils"

import { SongArtwork } from "@/components/library/song-artwork"

interface NowPlayingProps {
  className?: string
}

/**
 * The "what's playing" block on the left side of the PlayerBar: artwork +
 * title + artist. When nothing is loaded, shows a friendly idle state.
 */
export function NowPlaying({ className }: NowPlayingProps) {
  const { songs, currentIndex } = usePlayer()
  const song = currentIndex !== null ? songs[currentIndex] : undefined

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        className
      )}
    >
      <SongArtwork className="size-10 md:size-12" />
      <div className="min-w-0 flex-1">
        {song ? (
          <>
            <p className="text-foreground truncate text-sm font-medium">
              {song.title}
            </p>
            {song.artist && (
              <p className="text-muted-foreground truncate text-xs">
                {song.artist}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-foreground truncate text-sm font-medium">
              Nothing playing
            </p>
            <p className="text-muted-foreground truncate text-xs">
              Pick a song to start
            </p>
          </>
        )}
      </div>
    </div>
  )
}
