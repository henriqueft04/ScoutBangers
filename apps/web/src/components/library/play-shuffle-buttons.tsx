import { Pause, Play, Shuffle } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { usePlayFromList } from "@/hooks/usePlayFromList"
import { usePlayer } from "@/hooks/usePlayer"
import { shuffle } from "@/lib/shuffle"
import type { Song } from "@/lib/types"

interface PlayShuffleButtonsProps {
  songs: Song[]
  /** What the big button plays, for screen readers (e.g. "Reproduzir playlist"). */
  playLabel: string
}

/**
 * The shuffle button and the big play/pause button of a playlist or artist
 * page. Play starts the list from the top, or pauses when the player is
 * already on one of its songs; shuffle starts a random order.
 */
export function PlayShuffleButtons({
  songs: listed,
  playLabel,
}: PlayShuffleButtonsProps) {
  const { songs, currentIndex, isPlaying, toggle } = usePlayer()
  const playFromList = usePlayFromList()

  // The deck is "on this list" when the current song belongs to it.
  const currentSongId = currentIndex !== null ? songs[currentIndex]?.id : null
  const playingHere = Boolean(
    isPlaying &&
    currentSongId &&
    listed.some((song) => song.id === currentSongId)
  )

  const handlePlay = () => {
    if (playingHere) {
      toggle()
      return
    }
    const first = listed[0]
    if (first) playFromList(first, listed)
  }
  const handleShuffle = () => {
    // Play a pre-shuffled copy so the order is random from the first song.
    const order = shuffle(listed)
    const first = order[0]
    if (first) playFromList(first, order)
  }

  if (listed.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Reprodução aleatória"
        onClick={handleShuffle}
        className="text-muted-foreground hover:text-foreground"
      >
        <Shuffle className="size-5" />
      </Button>
      <button
        type="button"
        aria-label={playingHere ? "Pausar" : playLabel}
        onClick={handlePlay}
        className="bg-primary text-primary-foreground focus-visible:ring-ring/40 inline-flex size-10 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
      >
        {playingHere ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Play className="size-5 translate-x-0.5 fill-current" />
        )}
      </button>
    </div>
  )
}
