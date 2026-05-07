import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"

interface MainControlsProps {
  className?: string
}

/**
 * The five-button control cluster: shuffle | prev | play/pause | next | repeat.
 * Sized for touch on mobile (44px play, 36px secondaries) and dense on desktop.
 */
export function MainControls({ className }: MainControlsProps) {
  const {
    isPlaying,
    songs,
    currentIndex,
    shuffle,
    repeat,
    toggle,
    next,
    prev,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer()

  const hasSongs = songs.length > 0
  const hasCurrent = currentIndex !== null

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 md:gap-2",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle shuffle"
        aria-pressed={shuffle}
        onClick={toggleShuffle}
        disabled={!hasSongs}
        className={cn(
          "touch-manipulation",
          shuffle && "text-primary bg-accent"
        )}
      >
        <Shuffle />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Previous"
        onClick={prev}
        disabled={!hasCurrent}
        className="touch-manipulation"
      >
        <SkipBack />
      </Button>

      <Button
        type="button"
        variant="default"
        size="icon-lg"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={toggle}
        disabled={!hasSongs}
        className="size-11 touch-manipulation rounded-full md:size-10"
      >
        {isPlaying ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Play className="size-5 fill-current" />
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Next"
        onClick={next}
        disabled={!hasCurrent}
        className="touch-manipulation"
      >
        <SkipForward />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Repeat: ${repeat}`}
        aria-pressed={repeat !== "off"}
        onClick={cycleRepeat}
        disabled={!hasSongs}
        className={cn(
          "touch-manipulation",
          repeat !== "off" && "text-primary bg-accent"
        )}
      >
        {repeat === "one" ? <Repeat1 /> : <Repeat />}
      </Button>
    </div>
  )
}
