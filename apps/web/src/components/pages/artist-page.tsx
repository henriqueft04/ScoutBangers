import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { EmptyState } from "@/components/library/empty-state"
import { SongList } from "@/components/library/song-list"
import { useAllMetadataVersion } from "@/hooks/useAllMetadataVersion"
import { usePlayer } from "@/hooks/usePlayer"
import { songsByArtist } from "@/lib/artists"

/**
 * Spotify-like artist profile. Resolved from the URL segment, lists every
 * song attributed to that artist (by filename pattern or embedded tag), and
 * plays into the global queue.
 */
export function ArtistPage() {
  const { name = "" } = useParams<{ name: string }>()
  const decoded = decodeURIComponent(name)
  const { songs, currentIndex, isPlaying, play } = usePlayer()
  const metadataVersion = useAllMetadataVersion()

  const matched = React.useMemo(
    () => songsByArtist(songs, decoded),
    // Re-resolve when more tags become available in the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, decoded, metadataVersion]
  )

  const currentSongId =
    currentIndex !== null ? songs[currentIndex]?.id : undefined

  const handlePlay = React.useCallback(
    (filteredIndex: number) => {
      const song = matched[filteredIndex]
      if (!song) return
      const indexInAll = songs.findIndex((s) => s.id === song.id)
      if (indexInAll !== -1) play(indexInAll)
    },
    [matched, songs, play]
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/" aria-label="Back to library">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-muted-foreground text-xs">Artist</p>
      </div>

      <div>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
          {decoded}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {matched.length} {matched.length === 1 ? "song" : "songs"}
        </p>
      </div>

      {matched.length === 0 ? (
        <EmptyState
          variant="empty"
          message={`No songs found for "${decoded}".`}
        />
      ) : (
        <SongList
          songs={matched}
          currentIndex={
            currentSongId
              ? matched.findIndex((s) => s.id === currentSongId)
              : null
          }
          isPlaying={isPlaying}
          onPlay={handlePlay}
        />
      )}
    </div>
  )
}
