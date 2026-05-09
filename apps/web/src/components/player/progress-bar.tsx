import { Slider } from "@workspace/ui/components/slider"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import { formatTime } from "@/lib/format"

interface ProgressBarProps {
  className?: string
  /** Hide the time labels (used for the thin top-of-bar variant on mobile). */
  compact?: boolean
}

/**
 * Seekable progress slider with optional time labels. The Slider primitive
 * already handles touch + keyboard, so this is a thin presentational wrapper.
 */
export function ProgressBar({ className, compact = false }: ProgressBarProps) {
  const { position, duration, seek, currentIndex } = usePlayer()
  const max = duration > 0 ? duration : 0
  const value = max > 0 ? Math.min(position, max) : 0

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs tabular-nums",
        compact && "py-0",
        className
      )}
    >
      {!compact && (
        <span className="text-muted-foreground w-10 shrink-0 text-right">
          {formatTime(value)}
        </span>
      )}
      <Slider
        aria-label="Avançar"
        value={[value]}
        max={max || 1}
        step={0.1}
        disabled={currentIndex === null || max === 0}
        onValueChange={(values) => {
          const next = values[0]
          if (typeof next === "number") seek(next)
        }}
        className={cn("flex-1", compact && "py-2")}
      />
      {!compact && (
        <span className="text-muted-foreground w-10 shrink-0 text-left">
          {formatTime(max)}
        </span>
      )}
    </div>
  )
}
