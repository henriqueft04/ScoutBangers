import { cn } from "@workspace/ui/lib/utils"

import { SongRow } from "./song-row"
import type { Song } from "@/lib/types"

interface SongListProps {
  songs: Song[]
  currentIndex: number | null
  isPlaying: boolean
  onPlay: (index: number) => void
  /**
   * Optional per-song global play counts. When supplied, each row
   * shows its count under the title (same render path the home Top
   * 10 uses). Missing entries are rendered as no-count rather than 0
   * so a row whose count hasn't been fetched yet doesn't lie.
   */
  playCounts?: Map<string, number>
  /**
   * When true, song rows suppress the artist line. Used on the
   * artist page where every row would otherwise repeat the same
   * artist already shown in the page heading.
   */
  hideArtist?: boolean
  className?: string
}

export function SongList({
  songs,
  currentIndex,
  isPlaying,
  onPlay,
  playCounts,
  hideArtist,
  className,
}: SongListProps) {
  return (
    <ul
      role="list"
      className={cn("flex flex-col gap-px py-1", className)}
    >
      {songs.map((song, index) => (
        <li
          key={song.id}
          // Tour uses the 2nd row as the demo target: more songs have
          // embedded lyrics from track #2 onwards in the catalog, and
          // the lyrics step downstream depends on the playing song
          // having a lyrics payload to show.
          data-tour-id={index === 1 ? "song-list-demo" : undefined}
        >
          <SongRow
            song={song}
            index={index}
            isCurrent={currentIndex === index}
            isPlaying={isPlaying}
            onPlay={onPlay}
            playCount={playCounts?.get(song.id)}
            hideArtist={hideArtist}
          />
        </li>
      ))}
    </ul>
  )
}
