import * as React from "react"
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
    const onPop = () => onClose()
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
            <FavoriteButton songId={song.id} size="md" stopPropagation={false} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Share song"
              onClick={handleShare}
              className="touch-manipulation size-10"
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

        <div className="w-full max-w-sm text-center">
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

        <div className="flex w-full max-w-sm flex-col gap-4">
          <ProgressBar />
          <MainControls size="lg" />
          <VolumeControl className="mt-2 hidden md:flex md:justify-center" />
        </div>
      </div>

      <div
        aria-hidden
        style={{ height: "env(safe-area-inset-bottom)" }}
      />
    </div>
  )
}
