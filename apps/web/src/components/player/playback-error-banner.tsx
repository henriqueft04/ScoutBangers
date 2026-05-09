import { CircleAlert, X } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { usePlayer } from "@/hooks/usePlayer"

/**
 * Thin red strip above the PlayerBar that surfaces the most recent playback
 * error from the `<audio>` element (decode failure, unsupported codec, etc).
 * Auto-dismisses when the next song starts; dismissable via the close button.
 */
export function PlaybackErrorBanner() {
  const { playbackError, clearPlaybackError } = usePlayer()

  if (!playbackError) return null

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
        onClick={clearPlaybackError}
        className="text-primary-foreground hover:bg-primary-foreground/15 touch-manipulation"
      >
        <X />
      </Button>
    </div>
  )
}
