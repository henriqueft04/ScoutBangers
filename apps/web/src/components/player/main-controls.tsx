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
  /** "lg" doubles padding and bumps the play button to ~64px — used in
   *  the fullscreen now-playing sheet where touch targets get more room. */
  size?: "default" | "lg"
}

/**
 * The five-button control cluster: shuffle | prev | play/pause | next | repeat.
 * Sized for touch on mobile (44px play, 36px secondaries) and dense on desktop.
 */
export function MainControls({ className, size = "default" }: MainControlsProps) {
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

  const isLg = size === "lg"
  const sideButton = isLg ? "size-12" : ""
  const sideIcon = isLg ? "size-6" : ""
  const playButton = isLg ? "size-16 md:size-16" : "size-11 md:size-10"
  const playIcon = isLg ? "size-7" : "size-5"

  return (
    <div
      data-tour-id="player-controls"
      className={cn(
        "flex items-center justify-center gap-1 md:gap-2",
        isLg && "gap-3 md:gap-4",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Alternar aleatório"
        aria-pressed={shuffle}
        onClick={toggleShuffle}
        disabled={!hasSongs}
        data-tour-id="player-shuffle"
        className={cn(
          "touch-manipulation",
          sideButton,
          shuffle && "text-primary bg-accent"
        )}
      >
        <Shuffle className={sideIcon} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Anterior"
        onClick={prev}
        disabled={!hasCurrent}
        className={cn("touch-manipulation", sideButton)}
      >
        <SkipBack className={sideIcon} />
      </Button>

      <Button
        type="button"
        variant="default"
        size="icon-lg"
        aria-label={isPlaying ? "Pausar" : "Reproduzir"}
        onClick={toggle}
        disabled={!hasSongs}
        className={cn("touch-manipulation rounded-full", playButton)}
      >
        {isPlaying ? (
          <Pause className={cn(playIcon, "fill-current")} />
        ) : (
          <Play className={cn(playIcon, "fill-current")} />
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Seguinte"
        onClick={next}
        disabled={!hasCurrent}
        className={cn("touch-manipulation", sideButton)}
      >
        <SkipForward className={sideIcon} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Repetir: ${repeat}`}
        aria-pressed={repeat !== "off"}
        onClick={cycleRepeat}
        disabled={!hasSongs}
        data-tour-id="player-repeat"
        className={cn(
          "touch-manipulation",
          sideButton,
          repeat !== "off" && "text-primary bg-accent"
        )}
      >
        {repeat === "one" ? <Repeat1 className={sideIcon} /> : <Repeat className={sideIcon} />}
      </Button>
    </div>
  )
}
