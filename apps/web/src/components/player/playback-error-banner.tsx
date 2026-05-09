import { CircleAlert, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { usePlayer } from "@/hooks/usePlayer"

/**
 * Thin red strip above the PlayerBar that surfaces the most recent playback
 * error from the `<audio>` element (decode failure, unsupported codec, etc).
 * Auto-dismisses when the next song starts; dismissable via the close button.
 */
export function PlaybackErrorBanner() {
  const { playbackError, play, currentIndex } = usePlayer()

  if (!playbackError) return null

  const dismiss = () => {
    // Cheapest way to clear: re-play the same song (which clears the error)
    // or just hide. We don't expose a dedicated clear action — re-tapping a
    // song will clear it naturally. So this button just hides the banner by
    // forcing a no-op state update through play() if a song is loaded.
    if (currentIndex !== null) play(currentIndex)
  }

  return (
    <div
      role="alert"
      className="bg-primary text-primary-foreground flex items-center gap-2 px-3 py-2 text-xs md:px-6"
    >
      <CircleAlert className="size-4 shrink-0" />
      <p className="flex-1 truncate">{playbackError}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dispensar erro"
        onClick={dismiss}
        className="text-primary-foreground hover:bg-primary-foreground/15 touch-manipulation"
      >
        <X />
      </Button>
    </div>
  )
}
