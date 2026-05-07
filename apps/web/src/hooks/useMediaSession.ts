import * as React from "react"

import { usePlayer } from "./usePlayer"

const ARTWORK: MediaImage[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
]

const SEEK_OFFSET_SECONDS = 10

/**
 * Wires the player into `navigator.mediaSession` so audio keeps playing when
 * the phone is on another app or locked, and the OS shows real lock-screen
 * controls (play/pause/next/prev, scrub, Bluetooth-headphone buttons).
 *
 * Without this, iOS Safari and Chrome on Android will pause the `<audio>`
 * element when the page backgrounds. Setting `mediaSession.metadata` is the
 * signal the OS uses to keep the audio session alive.
 */
export function useMediaSession(): void {
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
  } = usePlayer()

  const supported =
    typeof navigator !== "undefined" && "mediaSession" in navigator

  // Metadata: title, artist, artwork. Updated whenever the song changes.
  React.useEffect(() => {
    if (!supported) return
    if (currentIndex === null) {
      navigator.mediaSession.metadata = null
      return
    }
    const song = songs[currentIndex]
    if (!song) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist ?? "ScoutBangers",
      album: "ScoutBangers",
      artwork: ARTWORK,
    })
  }, [supported, songs, currentIndex])

  // Reflect playing/paused so the OS controls stay in sync with our UI.
  React.useEffect(() => {
    if (!supported) return
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [supported, isPlaying])

  // Action handlers — what the OS controls and Bluetooth buttons trigger.
  React.useEffect(() => {
    if (!supported) return
    const session = navigator.mediaSession

    const wrap =
      (action: () => void): MediaSessionActionHandler =>
      () =>
        action()

    session.setActionHandler("play", wrap(toggle))
    session.setActionHandler("pause", wrap(toggle))
    session.setActionHandler("previoustrack", wrap(prev))
    session.setActionHandler("nexttrack", wrap(next))
    session.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime)
    })
    session.setActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
      seek(Math.max(0, position - offset))
    })
    session.setActionHandler("seekforward", (details) => {
      const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
      seek(Math.min(duration || position + offset, position + offset))
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
  }, [supported, toggle, prev, next, seek, position, duration])

  // Position state lets the lock-screen scrubber show real progress and
  // accept seek-to actions (the slider on iOS Control Center / Android
  // notification).
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
