import * as React from "react"
import { AnimatePresence } from "framer-motion"
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  ImageUp,
  Loader2,
  Share2,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { FavoriteButton } from "@/components/library/favorite-button"
import { MarqueeText } from "@/components/library/marquee-text"
import { SongArtwork } from "@/components/library/song-artwork"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { usePlayer } from "@/hooks/usePlayer"
import { artistHref } from "@/lib/artists"
import { canShareImage, shareImage, shareUrl } from "@/lib/share"
import { displayArtist, displayTitle } from "@/lib/song-display"

import { BottomSheet } from "./bottom-sheet"
import { LyricsPanel } from "./lyrics-panel"
import { MainControls } from "./main-controls"
import { PlaybackErrorBanner } from "./playback-error-banner"
import { ProgressBar } from "./progress-bar"
import { QueuePanel } from "./queue-panel"
import { QueueToggleButton } from "./queue-toggle-button"
import { VolumeControl } from "./volume-control"

interface FullscreenPlayerProps {
  open: boolean
  onClose: () => void
  /**
   * When the sheet opens, auto-expand one of the inner panels. Used by the
   * desktop player-bar's queue/lyrics buttons so a single click jumps
   * straight to that view.
   */
  initialPanel?: "queue" | "lyrics" | null
}

/**
 * Spotify-style expanded "now playing" sheet. Slides up from the bottom and
 * covers the whole viewport with large artwork + full controls. Closes via
 * the chevron, the Escape key, or the OS back button (we push a history
 * entry on open so `popstate` collapses the sheet first).
 */
export function FullscreenPlayer({ open, onClose, initialPanel = null }: FullscreenPlayerProps) {
  const { songs, currentIndex } = usePlayer()
  const navigate = useNavigate()
  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song), song?.modifiedTime)
  const [copied, setCopied] = React.useState(false)
  const [storyBusy, setStoryBusy] = React.useState(false)
  const [queueOpenRaw, setQueueOpenRaw] = React.useState(false)
  const [lyricsOpenRaw, setLyricsOpenRaw] = React.useState(false)
  // Live vertical offset while the user swipes the sheet down to dismiss.
  const [dragY, setDragY] = React.useState(0)

  // When the sheet opens with an `initialPanel` request, mirror it onto
  // the local raw state. Only fires on the open transition so the user
  // can still close the panel without it snapping back.
  const wasOpenRef = React.useRef(open)
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      setQueueOpenRaw(initialPanel === "queue")
      setLyricsOpenRaw(initialPanel === "lyrics")
    }
    wasOpenRef.current = open
  }, [open, initialPanel])

  /**
   * Navigate from inside the fullscreen sheet to a route. Pops our
   * `{fullscreen: true}` history marker FIRST (so the existing
   * popstate handler also tears the sheet down), then pushes the
   * destination once the pop has completed. Without this the sheet
   * stays as a hidden middle entry in history and the user has to
   * press back twice to get to where they were.
   *
   * The replace-via-react-router approach doesn't work here: by the
   * time react-router sees `navigate(..., { replace: true })`, our
   * marker isn't necessarily the entry it ends up rewriting (and
   * the effect cleanup can't see the marker anymore either).
   */
  const handleInternalNavigate = React.useCallback(
    (to: string) => {
      const state = window.history.state
      const hasFullscreenMarker =
        state &&
        typeof state === "object" &&
        (state as { fullscreen?: boolean }).fullscreen === true

      // If we're already at the destination URL (e.g. user is on
      // /artist/foo, opens fullscreen, clicks the same artist),
      // pushing it again would create a duplicate entry — same URL,
      // requires two back-presses to actually leave the page.
      const currentPath = window.location.pathname + window.location.search
      const sameDestination = currentPath === to

      if (!hasFullscreenMarker) {
        onClose()
        if (!sameDestination) navigate(to)
        return
      }

      // Pop our fullscreen marker. The existing popstate listener
      // tears the sheet down; if we're going somewhere new we then
      // push the destination on top of the now-clean stack. If the
      // destination is where we already were, popping the marker is
      // all we needed — we're already there.
      const onPop = () => {
        window.removeEventListener("popstate", onPop)
        if (!sameDestination) navigate(to)
      }
      window.addEventListener("popstate", onPop)
      window.history.back()
    },
    [navigate, onClose]
  )

  // Derive queueOpen / lyricsOpen from `open` so they auto-reset
  // whenever the fullscreen sheet itself is closed — no effect
  // needed, no stale state on re-open.
  const queueOpen = open && queueOpenRaw
  const lyricsOpen = open && lyricsOpenRaw
  const setQueueOpen = React.useCallback(
    (next: React.SetStateAction<boolean>) => {
      setQueueOpenRaw((prev) => {
        const value = typeof next === "function" ? next(prev) : next
        if (value) setLyricsOpenRaw(false)
        return value
      })
    },
    []
  )
  const setLyricsOpen = React.useCallback(
    (next: React.SetStateAction<boolean>) => {
      setLyricsOpenRaw((prev) => {
        const value = typeof next === "function" ? next(prev) : next
        if (value) setQueueOpenRaw(false)
        return value
      })
    },
    []
  )

  // OS back button while the queue panel is open should close just the
  // queue, not the fullscreen sheet. Push a marker on open and listen
  // for popstate; ignore the navigation when state.queue is set.
  React.useEffect(() => {
    if (!open || !queueOpen) return
    const marker = { fullscreen: true, queue: true }
    window.history.pushState(marker, "")
    const onPop = (event: PopStateEvent) => {
      // Only close the queue if the new state is no longer the queue
      // marker. Without this guard the fullscreen popstate listener
      // would also fire and tear the whole sheet down.
      const state = event.state as { queue?: boolean } | null
      if (state?.queue) return
      setQueueOpen(false)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (
        typeof window.history.state === "object" &&
        window.history.state !== null &&
        (window.history.state as { queue?: boolean }).queue
      ) {
        window.history.back()
      }
    }
  }, [open, queueOpen, setQueueOpen])

  // Same back-button bookkeeping for the lyrics panel.
  React.useEffect(() => {
    if (!open || !lyricsOpen) return
    const marker = { fullscreen: true, lyrics: true }
    window.history.pushState(marker, "")
    const onPop = (event: PopStateEvent) => {
      const state = event.state as { lyrics?: boolean } | null
      if (state?.lyrics) return
      setLyricsOpen(false)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (
        typeof window.history.state === "object" &&
        window.history.state !== null &&
        (window.history.state as { lyrics?: boolean }).lyrics
      ) {
        window.history.back()
      }
    }
  }, [open, lyricsOpen, setLyricsOpen])

  const handleShare = React.useCallback(async () => {
    if (!song) return
    const url = `${window.location.origin}/?song=${song.id}`
    const outcome = await shareUrl(displayTitle(song, null), url)
    if (outcome === "copied") {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [song])

  const handleShareStory = React.useCallback(async () => {
    if (!song || storyBusy) return
    setStoryBusy(true)
    try {
      const url = `${window.location.origin}/?song=${song.id}`
      // Lazy-loaded so the qrcode bundle stays out of the initial payload.
      const { renderStoryCard } = await import("@/lib/story-card")
      const blob = await renderStoryCard({
        title: displayTitle(song, meta),
        artist: displayArtist(song, meta),
        artUrl: meta?.pictureUrl,
        url,
      })
      await shareImage(displayTitle(song, meta), blob, `${song.id}.png`)
    } catch {
      // Rendering or sharing failed — fall back to the link share.
      await handleShare()
    } finally {
      setStoryBusy(false)
    }
  }, [song, meta, storyBusy, handleShare])

  // Escape key closes (desktop).
  React.useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Push a history entry while open, so the OS/browser back button collapses
  // the sheet rather than navigating away. We pop it on close.
  React.useEffect(() => {
    if (!open) return
    const marker = { fullscreen: true }
    window.history.pushState(marker, "")
    const onPop = (event: PopStateEvent) => {
      // If the new state still belongs to the fullscreen sheet (e.g.
      // we just dropped from the deeper queue marker), stay open.
      const state = event.state as { fullscreen?: boolean } | null
      if (state?.fullscreen) return
      onClose()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (
        typeof window.history.state === "object" &&
        window.history.state !== null &&
        (window.history.state as { fullscreen?: boolean }).fullscreen
      ) {
        window.history.back()
      }
    }
  }, [open, onClose])

  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Reset any leftover drag offset whenever the sheet (re)opens.
  React.useEffect(() => {
    if (open) setDragY(0)
  }, [open])

  // Swipe-down to dismiss (touch). We only track a downward drag and snap
  // back if the user doesn't pull far enough. Gestures that start on an
  // interactive control (button, slider, link) are ignored so taps and the
  // progress/volume sliders keep working.
  const touchStartY = React.useRef<number | null>(null)
  const dragYRef = React.useRef(0)
  const DISMISS_THRESHOLD = 90

  const handleTouchStart = React.useCallback((event: React.TouchEvent) => {
    if ((event.target as HTMLElement).closest("button, a, input, [role='slider']")) {
      touchStartY.current = null
      return
    }
    touchStartY.current = event.touches[0]?.clientY ?? null
  }, [])

  const handleTouchMove = React.useCallback((event: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = (event.touches[0]?.clientY ?? 0) - touchStartY.current
    // Only follow downward drags; clamp upward movement to zero.
    const next = Math.max(0, delta)
    dragYRef.current = next
    setDragY(next)
  }, [])

  const handleTouchEnd = React.useCallback(() => {
    if (touchStartY.current === null) return
    touchStartY.current = null
    if (dragYRef.current > DISMISS_THRESHOLD) onClose()
    dragYRef.current = 0
    setDragY(0)
  }, [onClose])

  // Scroll-down to dismiss (desktop wheel / trackpad). A clear downward
  // scroll collapses the sheet.
  const handleWheel = React.useCallback(
    (event: React.WheelEvent) => {
      if (event.deltaY > 30) onClose()
    },
    [onClose]
  )

  if (!open) return null

  const title = song ? displayTitle(song, meta) : "Nada a tocar"
  const artist = song ? displayArtist(song, meta) : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A reproduzir agora"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className={cn(
        "bg-background fixed inset-0 z-40 flex flex-col",
        dragY === 0 &&
          "animate-in slide-in-from-bottom duration-300 ease-out"
      )}
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: dragY > 0 ? "none" : "transform 0.3s ease-out",
        // Fade slightly as the sheet is pulled down for tactile feedback.
        opacity: dragY > 0 ? Math.max(0.6, 1 - dragY / 600) : undefined,
      }}
    >
      <header
        className="flex items-center justify-between px-3 py-3 md:px-6"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Recolher leitor"
          onClick={onClose}
          data-tour-id="fullscreen-close"
          className="touch-manipulation"
        >
          <ChevronDown />
        </Button>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          A Reproduzir
        </p>
        {song ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Partilhar música"
              onClick={handleShare}
              className="touch-manipulation hidden size-10 md:inline-flex"
            >
              {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
            </Button>
            <a
              href={`/api/stream/${song.id}`}
              download={title}
              aria-label="Transferir música"
              className="text-muted-foreground hover:text-foreground touch-manipulation inline-flex size-10 items-center justify-center rounded-md transition-colors"
            >
              <Download className="size-5" />
            </a>
          </div>
        ) : (
          <span className="size-10" aria-hidden />
        )}
      </header>

      <PlaybackErrorBanner />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-4 md:gap-8 md:pb-8">
        <div className="aspect-square w-full max-w-sm">
          {meta?.pictureUrl ? (
            <img
              src={meta.pictureUrl}
              alt=""
              decoding="async"
              className="size-full rounded-2xl object-cover shadow-lg"
            />
          ) : (
            <SongArtwork className="size-full rounded-2xl shadow-lg" />
          )}
        </div>

        <div className="flex w-full max-w-sm items-center gap-2 md:gap-3">
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
              <MarqueeText className="w-full text-center">{title}</MarqueeText>
            </h2>
            {artist ? (
              <button
                type="button"
                onClick={() => handleInternalNavigate(artistHref(artist))}
                className="text-muted-foreground hover:text-foreground mt-1 inline-block max-w-full truncate text-sm hover:underline"
              >
                {artist}
              </button>
            ) : (
              song && (
                <span className="text-muted-foreground mt-1 block text-sm" />
              )
            )}
          </div>
          {song ? (
            <span data-tour-id="player-favorite" className="hidden md:inline-flex">
              <FavoriteButton
                songId={song.id}
                size="md"
                stopPropagation={false}
              />
            </span>
          ) : null}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <ProgressBar />
          <div data-tour-id="fullscreen-controls-wrap">
            <MainControls size="lg" />
          </div>
          {/* Mobile actions row: share | heart | queue */}
          {song ? (
            <div className="flex items-center justify-between px-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Partilhar música"
                onClick={handleShare}
                data-tour-id="player-share"
                className="touch-manipulation size-11"
              >
                {copied ? (
                  <Check className="size-5" />
                ) : (
                  <Share2 className="size-5" />
                )}
              </Button>
              {canShareImage() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Partilhar nas stories"
                  onClick={handleShareStory}
                  disabled={storyBusy}
                  className="touch-manipulation size-11"
                >
                  {storyBusy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImageUp className="size-5" />
                  )}
                </Button>
              ) : null}
              <span data-tour-id="player-favorite" className="inline-flex">
                <FavoriteButton
                  songId={song.id}
                  size="md"
                  stopPropagation={false}
                />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={lyricsOpen ? "Fechar letra" : "Abrir letra"}
                aria-pressed={lyricsOpen}
                onClick={() => setLyricsOpen((v) => !v)}
                data-tour-id="player-lyrics"
                className={cn(
                  "touch-manipulation",
                  lyricsOpen && "text-primary"
                )}
              >
                <FileText className="size-5" />
              </Button>
              <span data-tour-id="player-queue" className="inline-flex">
                <QueueToggleButton
                  open={queueOpen}
                  onClick={() => setQueueOpen((v) => !v)}
                />
              </span>
            </div>
          ) : null}
          {/* Desktop: lyrics + queue buttons left of the volume slider */}
          {song ? (
            <div className="mt-2 hidden items-center gap-3 md:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={lyricsOpen ? "Fechar letra" : "Abrir letra"}
                aria-pressed={lyricsOpen}
                onClick={() => setLyricsOpen((v) => !v)}
                data-tour-id="player-lyrics"
                className={cn("size-10", lyricsOpen && "text-primary")}
              >
                <FileText className="size-5" />
              </Button>
              <span data-tour-id="player-queue" className="inline-flex">
                <QueueToggleButton
                  open={queueOpen}
                  onClick={() => setQueueOpen((v) => !v)}
                  sizeClass="size-10"
                />
              </span>
              <VolumeControl className="flex-1" />
            </div>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden
        style={{ height: "env(safe-area-inset-bottom)" }}
      />

      <AnimatePresence>
        {queueOpen ? (
          <BottomSheet
            key="queue"
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            ariaLabel="Fila"
          >
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </BottomSheet>
        ) : null}
        {lyricsOpen ? (
          <BottomSheet
            key="lyrics"
            open={lyricsOpen}
            onClose={() => setLyricsOpen(false)}
            ariaLabel="Letra"
          >
            <LyricsPanel onClose={() => setLyricsOpen(false)} />
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
