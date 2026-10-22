import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { ArtistBanner } from "@/components/artist/artist-banner"
import { EmptyState } from "@/components/library/empty-state"
import { PlayShuffleButtons } from "@/components/library/play-shuffle-buttons"
import { SongList } from "@/components/library/song-list"
import { useAllMetadataVersion } from "@/hooks/useAllMetadataVersion"
import { usePlayFromList } from "@/hooks/usePlayFromList"
import { usePlayer } from "@/hooks/usePlayer"
import { useSongPlayCounts } from "@/hooks/useSongPlayCounts"
import { fetchArtistListeners } from "@/lib/artist-listeners"
import { songsByArtist } from "@/lib/artists"

/**
 * Spotify-like artist profile. Resolved from the URL segment, lists every
 * song attributed to that artist (by filename pattern or embedded tag), and
 * plays into the global queue.
 */
export function ArtistPage() {
  const { name = "" } = useParams<{ name: string }>()
  const decoded = decodeURIComponent(name)
  const navigate = useNavigate()
  const { songs, currentIndex, isPlaying } = usePlayer()
  const playFromList = usePlayFromList()
  const metadataVersion = useAllMetadataVersion()

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate("/")
  }

  const matched = React.useMemo(
    () => songsByArtist(songs, decoded),
    // Re-resolve when more tags become available in the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, decoded, metadataVersion]
  )

  // All-time play counts per song, for each row and the artist's total.
  const playCounts = useSongPlayCounts()

  const [listeners, setListeners] = React.useState<number | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void fetchArtistListeners(decoded).then((count) => {
      if (!cancelled) setListeners(count)
    })
    return () => {
      cancelled = true
    }
  }, [decoded])

  const totalPlays = React.useMemo(() => {
    let sum = 0
    for (const song of matched) {
      sum += playCounts.get(song.id) ?? 0
    }
    return sum
  }, [matched, playCounts])

  const currentSongId =
    currentIndex !== null ? songs[currentIndex]?.id : undefined

  const handlePlay = React.useCallback(
    (filteredIndex: number) => {
      const song = matched[filteredIndex]
      if (song) playFromList(song, matched)
    },
    [matched, playFromList]
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pt-3 pb-4 md:px-6 md:pt-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={goBack}
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <p className="text-muted-foreground text-xs">Artista</p>
      </div>

      {matched.length > 0 ? (
        <ArtistBanner name={decoded} songs={matched} />
      ) : null}

      <div
        data-tour-id="artist-header"
        className="flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
            {decoded}
          </h1>
          {listeners ? (
            <p className="text-foreground mt-1 text-sm font-medium">
              {listeners.toLocaleString()}{" "}
              {listeners === 1 ? "ouvinte mensal" : "ouvintes mensais"}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-1 text-sm">
            {matched.length} {matched.length === 1 ? "música" : "músicas"}
            {totalPlays > 0 ? (
              <>
                {" · "}
                {totalPlays.toLocaleString()}{" "}
                {totalPlays === 1 ? "reprodução" : "reproduções"}
              </>
            ) : null}
          </p>
        </div>
        <PlayShuffleButtons songs={matched} playLabel="Reproduzir artista" />
      </div>

      {matched.length === 0 ? (
        <EmptyState
          variant="empty"
          message={`Nenhuma música encontrada para "${decoded}".`}
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
          playCounts={playCounts}
          hideArtist
        />
      )}
    </div>
  )
}
