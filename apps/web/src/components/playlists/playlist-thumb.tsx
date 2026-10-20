import { cn } from "@workspace/ui/lib/utils"

import { PlaylistCover } from "@/components/playlists/playlist-cover"
import { usePlayer } from "@/hooks/usePlayer"
import type { Song } from "@/lib/types"

interface PlaylistThumbProps {
  /** Playlist id; seeds the tile layout so it matches the playlist page. */
  seed?: string
  coverUrl?: string | null
  /** First sixteen song ids of the playlist, used when there is no custom cover. */
  previewSongIds?: string[]
  className?: string
}

/**
 * Small version of the playlist page banner for list rows — the same
 * custom cover or tiled artwork, just scaled down.
 */
export function PlaylistThumb({
  seed,
  coverUrl,
  previewSongIds = [],
  className,
}: PlaylistThumbProps) {
  const { songs } = usePlayer()
  const byId = new Map(songs.map((song) => [song.id, song]))
  const preview = previewSongIds
    .map((id) => byId.get(id))
    .filter((song): song is Song => Boolean(song))

  return (
    <PlaylistCover
      songs={preview}
      coverUrl={coverUrl}
      compact
      seed={seed}
      className={cn("w-20 shrink-0 rounded-md", className)}
    />
  )
}
