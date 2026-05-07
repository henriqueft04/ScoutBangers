import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { usePlayer } from "@/hooks/usePlayer"
import { cn } from "@workspace/ui/lib/utils"

import { SongArtwork } from "@/components/library/song-artwork"

interface NowPlayingProps {
  className?: string
}

/**
 * The "what's playing" block on the left side of the PlayerBar: artwork +
 * title + artist. Pulls embedded tags so the bar shows real album art and an
 * artist even when the filename doesn't have an `Artist - Title` shape.
 */
export function NowPlaying({ className }: NowPlayingProps) {
  const { songs, currentIndex } = usePlayer()
  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song))
  const title = song ? (song.title || meta?.title || "Untitled") : null
  const artist = song?.artist ?? meta?.artist

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="size-10 shrink-0 md:size-12">
        {meta?.pictureUrl ? (
          <img
            src={meta.pictureUrl}
            alt=""
            decoding="async"
            className="size-full rounded-md object-cover"
          />
        ) : (
          <SongArtwork className="size-full" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {song ? (
          <>
            <p className="text-foreground truncate text-sm font-medium">
              {title}
            </p>
            {artist && (
              <p className="text-muted-foreground truncate text-xs">
                {artist}
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
