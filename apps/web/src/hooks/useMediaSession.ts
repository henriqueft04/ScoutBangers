import * as React from "react"

import { isIOS } from "@/lib/audio-engine"
import { displayArtist, displayTitle } from "@/lib/song-display"
import { getPictureDataUrl } from "@/lib/track-metadata"

import { usePlayer } from "./usePlayer"
import { usePlayerProgress } from "./usePlayerProgress"
import { useTrackMetadata } from "./useTrackMetadata"

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
  const { position, duration } = usePlayerProgress()
  const {
    songs,
    currentIndex,
    isPlaying,
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

    // setActionHandler throws TypeError on browsers that don't know
    // a given action. We don't want one unsupported action to abort
    // the whole registration (e.g. failing `seekto` shouldn't leave
    // prev/next unregistered), so wrap each call individually.
    const safeSet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        /* action not supported on this UA */
      }
    }

    safeSet("play", () => {
      if (!isPlayingRef.current) toggleRef.current()
    })
    safeSet("pause", () => {
      if (isPlayingRef.current) toggleRef.current()
    })
    safeSet("previoustrack", () => prevRef.current())
    safeSet("nexttrack", () => nextRef.current())
    safeSet("seekto", (details) => {
      if (typeof details.seekTime === "number") seekRef.current(details.seekTime)
    })

    // iOS shows TWO secondary control slots in the lock-screen /
    // Control Center Now Playing widget. The default for HTML5
    // audio is the ±15s seek buttons — and WebKit keeps that
    // default in place unless you EXPLICITLY null out
    // seekbackward/seekforward via setActionHandler. Just *not*
    // registering them (what we used to do) leaves the UA default
    // active and the track-skip buttons we registered get hidden.
    // On non-iOS, ±10s is genuinely useful in the Android media
    // notification, so we register real handlers there.
    if (isIOS()) {
      safeSet("seekbackward", null)
      safeSet("seekforward", null)
    } else {
      safeSet("seekbackward", (details) => {
        const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
        seekRef.current(Math.max(0, positionRef.current - offset))
      })
      safeSet("seekforward", (details) => {
        const offset = details.seekOffset ?? SEEK_OFFSET_SECONDS
        const target = positionRef.current + offset
        const cap = durationRef.current > 0 ? durationRef.current : target
        seekRef.current(Math.min(cap, target))
      })
    }

    return () => {
      safeSet("play", null)
      safeSet("pause", null)
      safeSet("previoustrack", null)
      safeSet("nexttrack", null)
      safeSet("seekto", null)
      safeSet("seekbackward", null)
      safeSet("seekforward", null)
    }
  }, [supported])

  // Metadata: title / artist / artwork. Updated whenever the song or its
  // embedded tags change. Cached IDB entries only carry a Blob, not a
  // data URL — `getPictureDataUrl` lazily generates and caches one.
  React.useEffect(() => {
    if (!supported) return
    if (!song) {
      // Don't null the metadata on song-change cleanup — only when we
      // truly have no current song. iOS lock-screen blanks the player
      // for an instant when metadata is set to null and then re-set,
      // which is exactly the blink we're trying to avoid.
      navigator.mediaSession.metadata = null
      return
    }

    let cancelled = false
    const apply = (dataUrl: string | undefined) => {
      if (cancelled) return
      const artwork: MediaImage[] = dataUrl
        ? [
            {
              src: dataUrl,
              sizes: "512x512",
              type: meta?.pictureType ?? "image/jpeg",
            },
          ]
        : FALLBACK_ARTWORK

      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle(song, meta),
        artist: displayArtist(song, meta) ?? "ScoutBangers",
        album: meta?.album ?? "ScoutBangers",
        artwork,
      })
    }

    // Set metadata exactly once per song change. If the data URL is
    // already cached (typical for songs played before), apply
    // immediately. Otherwise wait for it to resolve so iOS sees a
    // single metadata update rather than fallback-then-real, which it
    // renders as a brief lock-screen blink.
    if (meta?.pictureDataUrl) {
      apply(meta.pictureDataUrl)
    } else if (meta?.pictureBlob) {
      void getPictureDataUrl(song.id).then(apply)
    } else {
      apply(undefined)
    }

    return () => {
      cancelled = true
    }
  }, [supported, song, meta])

  // Reflect playing/paused so OS controls stay in sync with our UI.
  React.useEffect(() => {
    if (!supported) return
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
  }, [supported, isPlaying])

  // Position state lets the lock-screen scrubber show real progress
  // and accept seek-to actions. timeupdate fires ~4 Hz which is
  // wasteful — every call is a cross-process IPC to the OS media
  // session. Throttle to ~1 Hz: skip the write unless at least 1 s
  // has passed OR duration / playing-state changed.
  const lastWriteRef = React.useRef(0)
  const lastDurationRef = React.useRef(0)
  React.useEffect(() => {
    if (!supported) return
    if (!("setPositionState" in navigator.mediaSession)) return
    if (!Number.isFinite(duration) || duration <= 0) return
    const now = Date.now()
    const durationChanged = duration !== lastDurationRef.current
    if (!durationChanged && now - lastWriteRef.current < 950) return
    lastWriteRef.current = now
    lastDurationRef.current = duration
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
