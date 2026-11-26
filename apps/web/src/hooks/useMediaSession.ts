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
/** Second registration after a Now Playing (re)start; see `register`. */
const LATE_REGISTER_MS = 750

/**
 * Cache of measured `${width}x${height}` per song id. Embedded album art
 * comes in whatever resolution the tagger happened to encode — claiming
 * "512x512" unconditionally (as this used to) is a lie for anything that
 * isn't actually that size, and some platforms are known to be picky
 * about a `MediaImage` whose declared `sizes` doesn't match reality.
 * Measured once per song by decoding the image, then reused.
 */
const artworkSizeCache = new Map<string, string>()

async function measureArtworkSizes(songId: string, dataUrl: string): Promise<string> {
  const cached = artworkSizeCache.get(songId)
  if (cached) return cached
  let sizes = "512x512"
  try {
    // An <img> rather than fetch(dataUrl): the CSP's connect-src doesn't
    // allow data: URLs, but img-src does.
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    sizes = `${image.naturalWidth}x${image.naturalHeight}`
  } catch {
    /* Undecodable — keep the generic guess below rather than fail the
     * whole metadata update over an artwork size hint. */
  }
  artworkSizeCache.set(songId, sizes)
  return sizes
}

/**
 * Bridges the player to `navigator.mediaSession` so audio keeps playing when
 * the phone is on another app or locked, and the OS shows real lock-screen
 * controls (play/pause/next/prev, scrub, Bluetooth-headphone buttons).
 *
 * Implementation notes:
 *   - Action handlers are registered on mount AND again whenever iOS may
 *     have restarted its Now Playing session (first `playing`, new track,
 *     back from background) — see `register`. Latest player state is read
 *     via refs inside the handlers, so none of this tears anything down on
 *     `timeupdate`.
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

  // (Re)installs every action handler. Handlers read the refs above, so this
  // is cheap and can run as often as needed — and it has to: WebKit drops
  // handlers registered before the page is "Now Playing" (and again when that
  // session restarts, e.g. on a new track), after which iOS falls back to its
  // own ±10s skip buttons. Registering once on mount, as this used to, always
  // happens before the first play, so the lock screen never got ours.
  const register = React.useCallback(() => {
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
    // audio is the ±10s seek buttons — and WebKit keeps that
    // default in place unless you EXPLICITLY null out
    // seekbackward/seekforward via setActionHandler. Just *not*
    // registering them leaves the UA default active and the
    // track-skip buttons we registered get hidden.
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
  }, [supported])

  React.useEffect(() => {
    if (!supported) return
    register()
    return () => {
      const session = navigator.mediaSession
      for (const action of [
        "play",
        "pause",
        "previoustrack",
        "nexttrack",
        "seekto",
        "seekbackward",
        "seekforward",
      ] as const) {
        try {
          session.setActionHandler(action, null)
        } catch {
          /* action not supported on this UA */
        }
      }
    }
  }, [supported, register])

  // Re-register whenever iOS may have (re)started the Now Playing session:
  // the moment audio actually starts (any deck — media events don't bubble,
  // hence the capture listener), when the page comes back from the
  // background, and on a bfcache restore. Each runs twice: right away, and
  // again shortly after, because the session can be established a beat
  // after the event fires.
  React.useEffect(() => {
    if (!supported) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const registerSoon = () => {
      register()
      clearTimeout(timer)
      timer = setTimeout(register, LATE_REGISTER_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") registerSoon()
    }
    document.addEventListener("playing", registerSoon, true)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", registerSoon)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("playing", registerSoon, true)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", registerSoon)
    }
  }, [supported, register])

  // A new track restarts the Now Playing session too.
  const songId = song?.id
  React.useEffect(() => {
    if (!supported || !songId || !isPlaying) return
    register()
    const timer = setTimeout(register, LATE_REGISTER_MS)
    return () => clearTimeout(timer)
  }, [supported, register, songId, isPlaying])

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
    const apply = async (dataUrl: string | undefined) => {
      // Measuring is cache-backed (see measureArtworkSizes) so this is a
      // no-op await for any song whose art we've already sized — only a
      // brand-new song's first-ever play pays for a real decode here,
      // and it happens before the ONE metadata write below, so it can't
      // introduce the fallback-then-real blink the single-write pattern
      // exists to avoid.
      const sizes =
        dataUrl
          ? await measureArtworkSizes(song.id, dataUrl)
          : "512x512"
      if (cancelled) return
      // When there is real artwork, offer ONLY that. Listing the app icons
      // after it looks harmless but isn't: the OS picks the image whose
      // declared size is closest to the one it wants (usually 512x512), and
      // a 404x404 cover loses to the icon-512 every time.
      const artwork: MediaImage[] = dataUrl
        ? [
            {
              src: dataUrl,
              sizes,
              type: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
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
      void apply(meta.pictureDataUrl)
    } else if (meta?.pictureBlob) {
      void getPictureDataUrl(song.id).then(apply)
    } else {
      void apply(undefined)
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
