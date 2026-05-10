import * as React from "react"
import { AnimatePresence } from "framer-motion"
import {
  Check,
  ChevronDown,
  Download,
  FileText,
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
import { shareUrl } from "@/lib/share"
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
  const [queueOpenRaw, setQueueOpenRaw] = React.useState(false)
  const [lyricsOpenRaw, setLyricsOpenRaw] = React.useState(false)

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

  if (!open) return null

  const title = song ? displayTitle(song, meta) : "Nada a tocar"
  const artist = song ? displayArtist(song, meta) : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A reproduzir agora"
      className="bg-background animate-in slide-in-from-bottom fixed inset-0 z-40 flex flex-col duration-300 ease-out"
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
            <FavoriteButton
              songId={song.id}
              size="md"
              stopPropagation={false}
              className="hidden md:inline-flex"
            />
          ) : null}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <ProgressBar />
          <MainControls size="lg" />
          {/* Mobile actions row: share | heart | queue */}
          {song ? (
            <div className="flex items-center justify-between px-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Partilhar música"
                onClick={handleShare}
                className="touch-manipulation size-11"
              >
                {copied ? (
                  <Check className="size-5" />
                ) : (
                  <Share2 className="size-5" />
                )}
              </Button>
              <FavoriteButton
                songId={song.id}
                size="md"
                stopPropagation={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={lyricsOpen ? "Fechar letra" : "Abrir letra"}
                aria-pressed={lyricsOpen}
                onClick={() => setLyricsOpen((v) => !v)}
                className={cn(
                  "touch-manipulation",
                  lyricsOpen && "text-primary"
                )}
              >
                <FileText className="size-5" />
              </Button>
              <QueueToggleButton
                open={queueOpen}
                onClick={() => setQueueOpen((v) => !v)}
              />
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
                className={cn("size-10", lyricsOpen && "text-primary")}
              >
                <FileText className="size-5" />
              </Button>
              <QueueToggleButton
                open={queueOpen}
                onClick={() => setQueueOpen((v) => !v)}
                sizeClass="size-10"
              />
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
