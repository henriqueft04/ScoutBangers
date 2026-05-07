import { cn } from "@workspace/ui/lib/utils"

import { SongRow } from "./song-row"
import type { Song } from "@/lib/types"

interface SongListProps {
  songs: Song[]
  currentIndex: number | null
  isPlaying: boolean
  onPlay: (index: number) => void
  className?: string
}

export function SongList({
  songs,
  currentIndex,
  isPlaying,
  onPlay,
  className,
}: SongListProps) {
  return (
    <ul
      role="list"
      className={cn("flex flex-col gap-px py-1", className)}
    >
      {songs.map((song, index) => (
        <li key={song.id}>
          <SongRow
            song={song}
            index={index}
            isCurrent={currentIndex === index}
            isPlaying={isPlaying}
            onPlay={onPlay}
          />
        </li>
      ))}
    </ul>
  )
}
