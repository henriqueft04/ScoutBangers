import { Check, Users } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useJam } from "@/hooks/useJam"
import { usePlayer } from "@/hooks/usePlayer"
import { useShareLink } from "@/hooks/useShareLink"
import { buildInviteUrl } from "@/lib/jam"
import { displayTitle } from "@/lib/song-display"

interface JamButtonProps {
  className?: string
}

/**
 * Starts a jam (or re-shares the one you're in) and shares its invite link
 * through the native share sheet — WhatsApp and friends. Whoever opens the
 * link listens along in real time.
 */
export function JamButton({ className }: JamButtonProps) {
  const { songs, currentIndex } = usePlayer()
  const { roomId, start } = useJam()
  const { copied, share } = useShareLink()

  const song = currentIndex !== null ? songs[currentIndex] : undefined
  if (!song) return null

  const handleClick = () =>
    void share(
      `Jam: ${displayTitle(song, null)}`,
      buildInviteUrl(window.location.origin, roomId ?? start())
    )

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Partilhar jam"
      aria-pressed={roomId !== null}
      onClick={handleClick}
      data-tour-id="player-jam"
      className={cn(className, roomId && "text-primary")}
    >
      {copied ? <Check className="size-5" /> : <Users className="size-5" />}
    </Button>
  )
}
