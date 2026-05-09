import { ChevronUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { FavoriteButton } from "@/components/library/favorite-button"
import { MarqueeText } from "@/components/library/marquee-text"
import { SongArtwork } from "@/components/library/song-artwork"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { usePlayer } from "@/hooks/usePlayer"
import { artistHref } from "@/lib/artists"
import { displayArtist, displayTitle } from "@/lib/song-display"

interface NowPlayingProps {
  className?: string
  onExpand?: () => void
}

/**
 * The "what's playing" block on the left side of the PlayerBar: artwork +
 * title (with marquee for long titles) + artist link. Pulls embedded tags
 * so the bar always shows real album art, the tag-defined title, and a
 * tag-defined artist. No artist line when the song has no embedded artist.
 *
 * Tapping the artwork or title region expands the fullscreen player. The
 * artist name remains a separate link to its profile.
 */
export function NowPlaying({ className, onExpand }: NowPlayingProps) {
  const { songs, currentIndex } = usePlayer()
  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song), song?.modifiedTime)
  const title = song ? displayTitle(song, meta) : null
  const artist = song ? displayArtist(song, meta) : undefined

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Abrir leitor em ecrã inteiro"
        onClick={onExpand}
        disabled={!song}
        className="size-10 shrink-0 overflow-hidden rounded-md p-0 md:size-12"
      >
        {meta?.pictureUrl ? (
          <img
            src={meta.pictureUrl}
            alt=""
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <SongArtwork className="size-full" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        {song && title ? (
          <>
            <button
              type="button"
              onClick={onExpand}
              className="text-foreground hover:text-primary block w-full text-left transition-colors"
            >
              <MarqueeText className="text-sm font-medium">{title}</MarqueeText>
            </button>
            {artist && (
              <Link
                to={artistHref(artist)}
                className="text-muted-foreground hover:text-foreground block max-w-full truncate text-xs hover:underline"
              >
                {artist}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-foreground truncate text-sm font-medium">
              Nada a tocar
            </p>
            <p className="text-muted-foreground truncate text-xs">
              Escolhe uma música para começar
            </p>
          </>
        )}
      </div>

      {song ? (
        <FavoriteButton songId={song.id} size="sm" stopPropagation />
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Abrir leitor em ecrã inteiro"
        onClick={onExpand}
        disabled={!song}
        className="touch-manipulation md:hidden"
      >
        <ChevronUp />
      </Button>
    </div>
  )
}
