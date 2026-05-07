import { cn } from "@workspace/ui/lib/utils"

import { MainControls } from "./main-controls"
import { NowPlaying } from "./now-playing"
import { ProgressBar } from "./progress-bar"
import { VolumeControl } from "./volume-control"

interface PlayerBarProps {
  className?: string
}

/**
 * Sticky bottom player bar.
 *
 * Layout:
 * - Mobile: progress bar on top (full width), then a single row containing
 *   `[NowPlaying] [MainControls]`. Volume is hidden (phones use hardware).
 * - `md+`: 3-column grid `[NowPlaying] [Controls + Progress stacked] [Volume]`.
 */
export function PlayerBar({ className }: PlayerBarProps) {
  return (
    <footer
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky inset-x-0 bottom-0 z-20 border-t backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      {/* Mobile: thin progress bar without time labels at the very top. */}
      <div className="px-3 pt-1 md:hidden">
        <ProgressBar compact />
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-4 md:px-6 md:py-3">
        <NowPlaying />

        <div className="flex flex-col items-stretch gap-1">
          <MainControls />
          <ProgressBar className="hidden w-full md:flex" />
        </div>

        <VolumeControl className="hidden justify-self-end md:flex" />
      </div>
    </footer>
  )
}
