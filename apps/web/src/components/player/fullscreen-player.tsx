import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, Download, Share2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { FavoriteButton } from "@/components/library/favorite-button"
import { MarqueeText } from "@/components/library/marquee-text"
import { SongArtwork } from "@/components/library/song-artwork"
import { useTrackMetadata } from "@/hooks/useTrackMetadata"
import { usePlayer } from "@/hooks/usePlayer"
import { artistHref } from "@/lib/artists"
import { displayArtist, displayTitle } from "@/lib/song-display"

import { MainControls } from "./main-controls"
import { PlaybackErrorBanner } from "./playback-error-banner"
import { ProgressBar } from "./progress-bar"
import { QueuePanel } from "./queue-panel"
import { QueueToggleButton } from "./queue-toggle-button"
import { VolumeControl } from "./volume-control"

interface FullscreenPlayerProps {
  open: boolean
  onClose: () => void
}

/**
 * Spotify-style expanded "now playing" sheet. Slides up from the bottom and
 * covers the whole viewport with large artwork + full controls. Closes via
 * the chevron, the Escape key, or the OS back button (we push a history
 * entry on open so `popstate` collapses the sheet first).
 */
export function FullscreenPlayer({ open, onClose }: FullscreenPlayerProps) {
  const { songs, currentIndex } = usePlayer()
  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song))
  const [copied, setCopied] = React.useState(false)
  const [queueOpenRaw, setQueueOpenRaw] = React.useState(false)

  // Derive queueOpen from `open` so it's automatically false whenever
  // the fullscreen sheet is closed — no effect needed, no stale state
  // on re-open.
  const queueOpen = open && queueOpenRaw
  const setQueueOpen = setQueueOpenRaw

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

  const handleShare = React.useCallback(async () => {
    if (!song) return
    const url = `${window.location.origin}/?song=${song.id}`
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: displayTitle(song, null), url })
        return
      } catch {
        // user cancelled or API unavailable — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  const title = song ? displayTitle(song, meta) : "Nothing playing"
  const artist = song ? displayArtist(song, meta) : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
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
          aria-label="Collapse player"
          onClick={onClose}
          className="touch-manipulation"
        >
          <ChevronDown />
        </Button>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          Now Playing
        </p>
        {song ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Share song"
              onClick={handleShare}
              className="touch-manipulation hidden size-10 md:inline-flex"
            >
              {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
            </Button>
            <a
              href={`/api/stream/${song.id}`}
              download={title}
              aria-label="Download song"
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
              <Link
                to={artistHref(artist)}
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground mt-1 inline-block max-w-full truncate text-sm hover:underline"
              >
                {artist}
              </Link>
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
                aria-label="Share song"
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
              <QueueToggleButton
                open={queueOpen}
                onClick={() => setQueueOpen((v) => !v)}
              />
            </div>
          ) : null}
          {/* Desktop: queue button left of the volume slider */}
          {song ? (
            <div className="mt-2 hidden items-center gap-3 md:flex">
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
          <motion.div
            key="queue-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 z-10 flex items-end justify-center md:items-center md:p-6"
            onClick={() => setQueueOpen(false)}
          >
            <div className="bg-background/60 absolute inset-0 backdrop-blur-sm" />
            <motion.div
              key="queue-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Queue"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 35 }}
              className="bg-card text-card-foreground border-border relative flex h-[78%] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border shadow-2xl md:h-[80vh] md:rounded-2xl"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex justify-center pt-2 md:hidden">
                <span
                  aria-hidden
                  className="bg-muted-foreground/30 h-1 w-10 rounded-full"
                />
              </div>
              <QueuePanel onClose={() => setQueueOpen(false)} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
