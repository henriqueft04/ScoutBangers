import * as React from "react"
import { ListPlus, Pause, Play } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { usePlayer } from "@/hooks/usePlayer"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { artistHref } from "@/lib/artists"
import { displayArtist, displayTitle } from "@/lib/song-display"
import type { Song } from "@/lib/types"

import { FavoriteButton } from "./favorite-button"
import { MarqueeText } from "./marquee-text"
import { TrackArtwork } from "./track-artwork"

interface SongRowProps {
  song: Song
  index: number
  isCurrent: boolean
  isPlaying: boolean
  onPlay: (index: number) => void
  /** When set, shown as a numeric badge on the left (e.g. for top-10 lists). */
  rank?: number
  /** When set, replaces the artist line with "N plays" — used on the home top-10. */
  playCount?: number
}

const SWIPE_THRESHOLD_PX = 70
const SWIPE_MAX_PX = 120

/**
 * One row in the library list. Tap to play, swipe right to add to queue.
 *
 * Implemented as `role="button"` rather than a `<button>` element so we can
 * legally nest a `<Link>` for the artist — `<a>` inside `<button>` is invalid
 * HTML. Keyboard activation is wired explicitly to keep this accessible.
 *
 * Embedded tags (artwork + artist + tag-title) load lazily once the
 * row scrolls into view. The marquee animation only runs on the
 * currently-playing row to keep big lists calm.
 */
export function SongRow({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  rank,
  playCount,
}: SongRowProps) {
  const { ref, meta } = useTrackVisuals<HTMLDivElement>(
    song.id,
    true,
    song.modifiedTime
  )
  const { queueAdd } = usePlayer()

  const Icon = isCurrent && isPlaying ? Pause : Play
  const title = displayTitle(song, meta)
  const artist = displayArtist(song, meta)

  const handleActivate = React.useCallback(() => {
    onPlay(index)
  }, [onPlay, index])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        handleActivate()
      }
    },
    [handleActivate]
  )

  // Swipe-right to enqueue. Pointer-based so it works for touch, mouse,
  // and trackpad alike. If the user drags past SWIPE_THRESHOLD_PX
  // horizontally we add the song to the queue and snap back. Vertical
  // movement cancels (so list scrolling wins).
  const startXRef = React.useRef<number | null>(null)
  const startYRef = React.useRef<number | null>(null)
  const swipingRef = React.useRef(false)
  const pointerIdRef = React.useRef<number | null>(null)
  const [offset, setOffset] = React.useState(0)
  const [enqueueFlash, setEnqueueFlash] = React.useState(false)

  const onPointerDown = (event: React.PointerEvent) => {
    // Only the primary pointer (not a right-click etc.).
    if (event.pointerType === "mouse" && event.button !== 0) return
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    swipingRef.current = false
    pointerIdRef.current = event.pointerId
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (
      pointerIdRef.current !== event.pointerId ||
      startXRef.current === null ||
      startYRef.current === null
    )
      return
    const dx = event.clientX - startXRef.current
    const dy = event.clientY - startYRef.current
    if (!swipingRef.current) {
      // Commit to a horizontal swipe once movement is clearly sideways.
      if (dx > 10 && dx > Math.abs(dy) * 1.5) {
        swipingRef.current = true
        // Capture the pointer so we keep getting events even if it
        // leaves the row's hit-area mid-drag.
        ;(event.target as Element).setPointerCapture?.(event.pointerId)
      } else if (Math.abs(dy) > 10) {
        startXRef.current = null
        startYRef.current = null
        pointerIdRef.current = null
        return
      }
    }
    if (swipingRef.current && dx > 0) {
      setOffset(Math.min(dx, SWIPE_MAX_PX))
    }
  }

  const onPointerEnd = () => {
    if (swipingRef.current && offset >= SWIPE_THRESHOLD_PX) {
      queueAdd(song.id)
      setEnqueueFlash(true)
      window.setTimeout(() => setEnqueueFlash(false), 700)
    }
    setOffset(0)
    swipingRef.current = false
    startXRef.current = null
    startYRef.current = null
    pointerIdRef.current = null
  }

  return (
    <div ref={ref} className="relative">
      {/* Background reveal during swipe */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-start rounded-md pl-4 transition-opacity",
          "bg-primary/10 text-primary",
          offset > 8 || enqueueFlash ? "opacity-100" : "opacity-0"
        )}
      >
        <ListPlus className="size-5" />
        <span className="ml-2 text-xs font-medium uppercase tracking-wider">
          {enqueueFlash ? "Added" : "Queue"}
        </span>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          // Treat as a tap only when no real swipe happened.
          if (offset > 4) {
            event.preventDefault()
            return
          }
          handleActivate()
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        data-current={isCurrent || undefined}
        aria-label={
          isCurrent && isPlaying ? `Pause ${title}` : `Play ${title}`
        }
        style={{
          transform: offset > 0 ? `translateX(${offset}px)` : undefined,
          transition: offset > 0 ? "none" : "transform 200ms ease-out",
        }}
        className={cn(
          "group/row bg-background flex w-full touch-pan-y cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left",
          "hover:bg-muted active:bg-accent transition-colors",
          "focus-visible:ring-ring/40 focus-visible:ring-3 focus-visible:outline-none",
          "data-[current]:bg-accent",
          "min-h-14 md:min-h-12"
        )}
      >
        {rank !== undefined ? (
          <span
            aria-hidden
            className={cn(
              "w-5 shrink-0 text-center text-base font-semibold tabular-nums md:w-6",
              isCurrent ? "text-primary" : "text-muted-foreground"
            )}
          >
            {rank}
          </span>
        ) : null}
        <TrackArtwork
          meta={meta}
          className="size-10 md:size-11"
          overlay={
            <span
              className={cn(
                "bg-foreground/40 text-primary-foreground pointer-events-none absolute inset-0 hidden items-center justify-center rounded-md",
                "group-hover/row:flex group-data-[current]/row:flex"
              )}
            >
              <Icon className="size-4 fill-current" />
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <MarqueeText
            enabled={isCurrent}
            className={cn(
              "text-sm font-medium",
              isCurrent ? "text-primary" : "text-foreground"
            )}
          >
            {title}
          </MarqueeText>
          {playCount !== undefined ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {playCount.toLocaleString()}{" "}
              {playCount === 1 ? "play" : "plays"}
            </p>
          ) : artist ? (
            <Link
              to={artistHref(artist)}
              onClick={(event) => event.stopPropagation()}
              className="text-muted-foreground hover:text-foreground inline-block max-w-full truncate text-xs hover:underline"
            >
              {artist}
            </Link>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add to queue"
          onClick={(event) => {
            event.stopPropagation()
            queueAdd(song.id)
          }}
          className="text-muted-foreground hover:text-foreground touch-manipulation"
        >
          <ListPlus className="size-4" />
        </Button>
        <FavoriteButton songId={song.id} size="sm" />
      </div>
    </div>
  )
}
