import { Volume1, Volume2, VolumeOff, VolumeX } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"

interface VolumeControlProps {
  className?: string
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted) return <VolumeOff />
  if (volume === 0) return <VolumeX />
  if (volume < 0.5) return <Volume1 />
  return <Volume2 />
}

/**
 * Volume slider + mute toggle. Hidden on mobile (`md:` breakpoint controlled
 * by the parent) since phones use hardware volume buttons.
 */
export function VolumeControl({ className }: VolumeControlProps) {
  const { volume, muted, setVolume, toggleMute } = usePlayer()
  const displayed = muted ? 0 : volume

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={muted ? "Ativar som" : "Silenciar"}
        aria-pressed={muted}
        onClick={toggleMute}
        className="touch-manipulation"
      >
        <VolumeIcon volume={volume} muted={muted} />
      </Button>
      <Slider
        aria-label="Volume"
        value={[displayed]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(values) => {
          const next = values[0]
          if (typeof next === "number") setVolume(next)
        }}
        className="w-24"
      />
    </div>
  )
}
