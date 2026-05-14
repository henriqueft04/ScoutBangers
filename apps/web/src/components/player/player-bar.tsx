import { ChevronUp, FileText } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"

import { MainControls } from "./main-controls"
import { NowPlaying } from "./now-playing"
import { PlaybackErrorBanner } from "./playback-error-banner"
import { ProgressBar } from "./progress-bar"
import { QueueToggleButton } from "./queue-toggle-button"
import { VolumeControl } from "./volume-control"

interface PlayerBarProps {
  className?: string
  onExpand: () => void
  /**
   * Desktop-only: opens the fullscreen sheet pre-focused on the queue
   * panel. Wired by AppShell so the sheet's `initialPanel` stays
   * authoritative.
   */
  onOpenQueue: () => void
  /** Same as onOpenQueue but for the lyrics panel. */
  onOpenLyrics: () => void
}

/**
 * Sticky bottom player bar.
 *
 * Layout:
 * - Mobile: progress bar on top (full width), then a single row containing
 *   `[NowPlaying] [MainControls]`. Volume is hidden (phones use hardware).
 * - `md+`: 3-column grid `[NowPlaying] [Controls + Progress stacked] [Volume]`.
 *
 * Tapping the artwork/title region expands the fullscreen player; an explicit
 * chevron button on the right does the same. The artist name within
 * NowPlaying is a link, so clicks there navigate instead.
 */
export function PlayerBar({
  className,
  onExpand,
  onOpenQueue,
  onOpenLyrics,
}: PlayerBarProps) {
  const { currentIndex, songs } = usePlayer()
  const hasSong = currentIndex !== null && Boolean(songs[currentIndex])
  return (
    <div
      data-tour-id="player-bar"
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 border-t backdrop-blur",
        className
      )}
    >
      <PlaybackErrorBanner />

      {/* Mobile: thin progress bar without time labels at the very top. */}
      <div className="px-3 pt-1 md:hidden">
        <ProgressBar compact />
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-4 md:px-6 md:py-3">
        <NowPlaying onExpand={onExpand} />

        <div className="flex flex-col items-stretch gap-1">
          <MainControls />
          <ProgressBar className="hidden w-full md:flex" />
        </div>

        <div className="hidden items-center gap-2 justify-self-end md:flex">
          {hasSong ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Abrir letra"
                onClick={onOpenLyrics}
                className="touch-manipulation"
              >
                <FileText />
              </Button>
              <QueueToggleButton
                open={false}
                onClick={onOpenQueue}
                sizeClass="size-8"
                iconClass="size-4"
              />
            </>
          ) : null}
          <VolumeControl />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir leitor em ecrã inteiro"
            onClick={onExpand}
            className="touch-manipulation"
          >
            <ChevronUp />
          </Button>
        </div>
      </div>
    </div>
  )
}
