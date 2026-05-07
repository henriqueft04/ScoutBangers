import * as React from "react"

import { useTrackMetadata } from "./useTrackMetadata"
import { usePlayer } from "./usePlayer"

const FALLBACK_ARTWORK: MediaImage[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
]

const SEEK_OFFSET_SECONDS = 10

/**
 * Bridges the player to `navigator.mediaSession` so audio keeps playing when
 * the phone is on another app or locked, and the OS shows real lock-screen
 * controls (play/pause/next/prev, scrub, Bluetooth-headphone buttons).
 *
 * Implementation notes:
 *   - Action handlers are registered ONCE on mount. Latest player state is
 *     read via refs inside the handlers, so we don't tear down + reattach
 *     them on every `timeupdate` (which used to leave a tiny gap during which
 *     iOS could miss prev/next presses).
 *   - Lock-screen artwork uses the embedded album art's data URL when
 *     available — Blob URLs aren't reliably loaded by the OS lock-screen
 *     process on iOS.
 */
export function useMediaSession(): void {
  const player = usePlayer()
  const {
    songs,
    currentIndex,
    isPlaying,
    position,
    duration,
    toggle,
    next,
    prev,
    seek,
  } = player

  const song = currentIndex !== null ? songs[currentIndex] : undefined
  const meta = useTrackMetadata(song?.id, Boolean(song))

  const supported =
    typeof navigator !== "undefined" && "mediaSession" in navigator

  // Refs that track latest values for use inside long-lived action handlers.
  const positionRef = React.useRef(position)
  const durationRef = React.useRef(duration)
  const isPlayingRef = React.useRef(isPlaying)
  const toggleRef = React.useRef(toggle)
  const prevRef = React.useRef(prev)
  const nextRef = React.useRef(next)
  const seekRef = React.useRef(seek)

  React.useLayoutEffect(() => {
    positionRef.current = position
    durationRef.current = duration
    isPlayingRef.current = isPlaying
    toggleRef.current = toggle
    prevRef.current = prev
    nextRef.current = next
    seekRef.current = seek
  })

  // Register action handlers exactly once. Refs above keep them current.
  React.useEffect(() => {
    if (!supported) return
    const session = navigator.mediaSession

    session.setActionHandler("play", () => {
      if (!isPlayingRef.current) toggleRef.current()
    })
    session.setActionHandler("pause", () => {
      if (isPlayingRef.current) toggleRef.current()
    })
    session.setActionHandler("previoustrack", () => prevRef.current())
    session.setActionHandler("nexttrack", () => nextRef.current())
    session.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seekRef.current(details.seekTime)
    })
    session.setActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
      seekRef.current(Math.max(0, positionRef.current - offset))
    })
    session.setActionHandler("seekforward", (details) => {
      const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
      const target = positionRef.current + offset
      const cap = durationRef.current > 0 ? durationRef.current : target
      seekRef.current(Math.min(cap, target))
    })

    return () => {
      session.setActionHandler("play", null)
      session.setActionHandler("pause", null)
      session.setActionHandler("previoustrack", null)
      session.setActionHandler("nexttrack", null)
      session.setActionHandler("seekto", null)
      session.setActionHandler("seekbackward", null)
      session.setActionHandler("seekforward", null)
    }
  }, [supported])

  // Metadata: title / artist / artwork. Updated whenever the song or its
  // embedded tags change.
  React.useEffect(() => {
    if (!supported) return
    if (!song) {
      navigator.mediaSession.metadata = null
      return
    }
    const artwork: MediaImage[] = meta?.pictureDataUrl
      ? [
          {
            src: meta.pictureDataUrl,
            sizes: "512x512",
            type: meta.pictureType ?? "image/jpeg",
          },
        ]
      : FALLBACK_ARTWORK

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || meta?.title || "Untitled",
      artist: song.artist ?? meta?.artist ?? "ScoutBangers",
      album: meta?.album ?? "ScoutBangers",
      artwork,
    })
  }, [supported, song, meta])

  // Reflect playing/paused so OS controls stay in sync with our UI.
  React.useEffect(() => {
    if (!supported) return
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [supported, isPlaying])

  // Position state lets the lock-screen scrubber show real progress and
  // accept seek-to actions.
  React.useEffect(() => {
    if (!supported) return
    if (!("setPositionState" in navigator.mediaSession)) return
    if (!Number.isFinite(duration) || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: 1,
      })
    } catch {
      /* setPositionState throws on certain edge cases; safe to ignore */
    }
  }, [supported, position, duration])
}
