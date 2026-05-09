import * as React from "react"

import { useSongs } from "@/hooks/useSongs"
import { streamUrl } from "@/lib/audio-url"
import { fadeVolume, type FadeHandle } from "@/lib/fade"
import { shufflePreservingCurrent } from "@/lib/shuffle"
import { getCached, setCached } from "@/lib/storage"
import {
  ensureTrackMetadata,
  peekTrackMetadata,
  prefetchAllMetadata,
} from "@/lib/track-metadata"
import type { PlayerContextValue, SortMode } from "@/lib/types"

import { PlayerContext } from "./player-context"
import {
  initialPlayerState,
  playerReducer,
  type InternalPlayerState,
} from "./player-reducer"

const VOLUME_KEY = "scoutbangers:volume"
const SORT_KEY = "scoutbangers:sort"
const PLAYBACK_KEY = "scoutbangers:playback"
const PREFS_TTL_MS = 365 * 24 * 60 * 60 * 1000

interface PersistedPlayback {
  songId: string
  position: number
}

const VALID_SORTS: ReadonlyArray<SortMode> = ["default", "title", "artist"]

const CROSSFADE_MS = 2000
/**
 * Trigger crossfade when this many seconds remain. Matches CROSSFADE_MS
 * so the fade ends right at the natural end of the current song. The
 * backgrounded reliability fix (interval-driven trigger, hard-cut path
 * when hidden) handles backgrounded playback at this same threshold —
 * browsers keep setInterval near 1 Hz on tabs that are actively
 * playing audio, which is enough lead at a 2 s threshold.
 */
const CROSSFADE_LEAD_SECONDS = 2
/** Begin prefetching the next song's audio onto the idle deck this far in. */
/** Trigger the idle-deck preload this far into the current song.
 *  Earlier = more reliable when the tab is backgrounded (Android/iOS
 *  throttle `timeupdate` to ~1 Hz when hidden, which can mean a 0.5
 *  trigger fires too late if the song is short). 0.25 gives plenty
 *  of lead time and the network cost is the same. */
const PREFETCH_PROGRESS = 0.25

interface PersistedVolume {
  volume: number
  muted: boolean
}

type DeckId = 0 | 1
const otherDeck = (deck: DeckId): DeckId => (deck === 0 ? 1 : 0)

/** Set of song ids whose audio body we've already kicked into the
 *  browser's HTTP cache. Module scope so it survives re-renders. */
const warmedSongIds = new Set<string>()

/**
 * Fire-and-forget GETs for the next N upcoming songs in the playback
 * list. The browser caches each response in its HTTP cache (Vercel
 * already serves the proxy with Cache-Control: immutable for full
 * responses), so a subsequent audio fetch is a cache hit.
 *
 * Once warmed, ids are remembered for the page session — we don't
 * re-warm. Skips the active deck's currently-playing song.
 */
function warmHttpCacheForUpcoming(
  state: { songs: Array<{ id: string; modifiedTime: string }>; playbackList: string[]; currentIndex: number | null },
  count: number
): void {
  const currentId =
    state.currentIndex !== null ? state.songs[state.currentIndex]?.id : null
  if (!currentId) return
  const here = state.playbackList.indexOf(currentId)
  if (here === -1) return
  let warmed = 0
  for (
    let i = here + 1;
    i < state.playbackList.length && warmed < count;
    i++
  ) {
    const id = state.playbackList[i]!
    if (warmedSongIds.has(id)) {
      warmed++
      continue
    }
    warmedSongIds.add(id)
    void fetch(`/api/stream/${id}`).catch(() => undefined)
    warmed++
  }
}

/**
 * Read the canonical playback duration for whatever song is loaded on
 * an audio deck. Prefers the value parsed from the file's tags
 * (TLEN / Xing / mvhd, surfaced via `peekTrackMetadata`) over
 * `audio.duration`, which the browser estimates from first-frame
 * bitrate and gets wrong by tens of seconds for tagless VBR files.
 * Falls back to `audio.duration` when no metadata duration is cached.
 */
function canonicalDuration(audio: HTMLAudioElement): number {
  const src = audio.currentSrc || audio.src
  const match = src.match(/\/api\/stream\/([^/?#]+)/)
  if (match) {
    const id = decodeURIComponent(match[1]!)
    const meta = peekTrackMetadata(id)
    if (meta?.duration && meta.duration > 0) return meta.duration
  }
  return audio.duration
}

/**
 * Owns two `<audio>` elements (a "two-deck" architecture) and exposes player
 * state + actions via {@link PlayerContext}. Songs are sourced from
 * {@link useSongs} (stale-while-revalidate from `/api/songs`).
 *
 * Why two decks:
 *   1. **Crossfade** — when one song nears its end (or the user picks another
 *      while music is playing), we ramp the outgoing deck's volume to 0 and
 *      the incoming deck's volume to user volume over 2 seconds. A single
 *      `<audio>` element can't overlap itself.
 *   2. **Prefetch** — once the active song is past 50%, we point the idle
 *      deck at the predicted next song so the audio is already buffered when
 *      the crossfade fires. Eliminates the proxy + Drive RTT for normal
 *      playback transitions.
 *
 * The active deck is tracked via a ref (synchronous, no re-renders). Both
 * decks share the same set of event listeners; each handler ignores events
 * from the inactive deck so the reducer only ever sees the song that's
 * actually playing.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const deckARef = React.useRef<HTMLAudioElement>(null)
  const deckBRef = React.useRef<HTMLAudioElement>(null)
  const activeDeckRef = React.useRef<DeckId>(0)
  const fadesRef = React.useRef<Record<DeckId, FadeHandle | null>>({
    0: null,
    1: null,
  })
  /** Set true once we've kicked off the auto-advance crossfade for the
   *  current song; reset on every track change. */
  const crossfadeArmedRef = React.useRef(false)
  /** Song id that is currently preloaded onto the idle deck (if any). */
  const prefetchedIdRef = React.useRef<string | null>(null)
  /** True while we're swapping the audio.src — causes a transient pause
   *  event we want to ignore so the OS lock-screen UI doesn't flicker. */
  const switchingSrcRef = React.useRef(false)

  const [state, dispatch] = React.useReducer(
    playerReducer,
    initialPlayerState,
    (init) => {
      const stored = getCached<SortMode>(SORT_KEY)
      if (stored && VALID_SORTS.includes(stored)) {
        return { ...init, sort: stored }
      }
      return init
    }
  )

  const stateRef = React.useRef<InternalPlayerState>(state)
  React.useLayoutEffect(() => {
    stateRef.current = state
  })

  const { songs, loading, error, reload } = useSongs()

  React.useEffect(() => {
    dispatch({ type: "SONGS", songs, loading, error })
  }, [songs, loading, error])

  const sharedSongHandled = React.useRef(false)

  // ---- Persistence -----------------------------------------------------

  React.useEffect(() => {
    const stored = getCached<PersistedVolume>(VOLUME_KEY)
    if (!stored) return
    for (const ref of [deckARef, deckBRef]) {
      const audio = ref.current
      if (audio) {
        audio.volume = stored.volume
        audio.muted = stored.muted
      }
    }
  }, [])

  React.useEffect(() => {
    setCached<PersistedVolume>(
      VOLUME_KEY,
      { volume: state.volume, muted: state.muted },
      PREFS_TTL_MS
    )
  }, [state.volume, state.muted])

  React.useEffect(() => {
    setCached<SortMode>(SORT_KEY, state.sort, PREFS_TTL_MS)
  }, [state.sort])

  // Persist current song + position so a refresh doesn't lose context.
  // Position writes are throttled to once every 5 s.
  const lastPositionWriteRef = React.useRef(0)
  React.useEffect(() => {
    if (state.currentIndex === null) return
    const song = state.songs[state.currentIndex]
    if (!song) return
    const now = Date.now()
    if (now - lastPositionWriteRef.current < 5000) return
    lastPositionWriteRef.current = now
    setCached<PersistedPlayback>(
      PLAYBACK_KEY,
      { songId: song.id, position: state.position },
      PREFS_TTL_MS
    )
  }, [state.currentIndex, state.position, state.songs])

  // Restore previous song + position once songs have loaded. Doesn't
  // auto-play (browser autoplay policy needs a fresh user gesture);
  // user clicks play and resumes from where they left off.
  const playbackRestoredRef = React.useRef(false)
  React.useEffect(() => {
    if (playbackRestoredRef.current) return
    if (loading || songs.length === 0) return
    playbackRestoredRef.current = true

    const stored = getCached<PersistedPlayback>(PLAYBACK_KEY)
    if (!stored) return
    const index = songs.findIndex((s) => s.id === stored.songId)
    if (index === -1) return

    const audio = deckARef.current
    if (!audio) return
    audio.src = streamUrl(stored.songId)
    audio.currentTime = stored.position
    activeDeckRef.current = 0
    dispatch({ type: "SET_INDEX", index })
    dispatch({ type: "TIME", position: stored.position })
  }, [songs, loading])

  // Background prefetch: kick off after a short idle delay so the initial
  // render isn't competing with metadata reads. All requests go through the
  // global 2-req/s queue in `lib/track-metadata.ts`, and a persistent
  // localStorage cache means subsequent visits skip the slow first pass.
  React.useEffect(() => {
    if (loading || songs.length === 0) return
    const ids = songs.map((song) => song.id)
    const handle = setTimeout(() => {
      void prefetchAllMetadata(ids)
    }, 1500)
    return () => clearTimeout(handle)
  }, [songs, loading])

  // ---- Deck helpers ----------------------------------------------------

  const getDeck = React.useCallback((deck: DeckId) => {
    return deck === 0 ? deckARef.current : deckBRef.current
  }, [])

  const userTargetVolume = React.useCallback(() => {
    const s = stateRef.current
    return s.muted ? 0 : s.volume
  }, [])

  const cancelFades = React.useCallback(() => {
    fadesRef.current[0]?.cancel()
    fadesRef.current[1]?.cancel()
    fadesRef.current = { 0: null, 1: null }
  }, [])

  const setFade = React.useCallback(
    (deck: DeckId, handle: FadeHandle) => {
      fadesRef.current[deck]?.cancel()
      fadesRef.current[deck] = handle
    },
    []
  )

  // ---- Compute next/prev (queue navigation) ----------------------------

  const computeAdvance = React.useCallback(
    (
      direction: 1 | -1,
      auto: boolean
    ): { index: number; fromQueue?: boolean } | null => {
      const s = stateRef.current
      if (s.songs.length === 0) return null

      // Forward navigation: user queue takes priority over natural next.
      if (direction === 1 && s.userQueue.length > 0) {
        const head = s.userQueue[0]
        if (head) {
          const idx = s.songs.findIndex((song) => song.id === head.songId)
          if (idx !== -1) return { index: idx, fromQueue: true }
        }
      }

      if (auto && s.repeat === "one" && s.currentIndex !== null) {
        return { index: s.currentIndex }
      }

      // Walk playbackList based on the current song's position there.
      const list = s.playbackList.length > 0
        ? s.playbackList
        : s.songs.map((song) => song.id)
      if (list.length === 0) return null

      const currentSongId =
        s.currentIndex !== null ? s.songs[s.currentIndex]?.id ?? null : null
      const here = currentSongId ? list.indexOf(currentSongId) : -1
      let next = here + direction
      if (next >= list.length) {
        if (s.repeat === "all") next = 0
        else return null
      } else if (next < 0) {
        next = list.length - 1
      }

      const nextSongId = list[next]
      if (!nextSongId) return null
      const idx = s.songs.findIndex((song) => song.id === nextSongId)
      if (idx === -1) return null
      return { index: idx }
    },
    []
  )

  // Drop the first occurrence of a song id from the user queue. Called
  // whenever a song actually starts playing — keeps the displayed queue
  // consistent with what's left to play (user-explicit duplicates remain
  // until each is consumed in turn).
  const consumeQueueSong = React.useCallback((songId: string) => {
    const s = stateRef.current
    const queueIdx = s.userQueue.findIndex((item) => item.songId === songId)
    if (queueIdx === -1) return
    dispatch({
      type: "QUEUE_SET",
      queue: [
        ...s.userQueue.slice(0, queueIdx),
        ...s.userQueue.slice(queueIdx + 1),
      ],
    })
  }, [])

  // ---- Core playback ---------------------------------------------------

  const playIndex = React.useCallback(
    (index: number, opts: { crossfade?: boolean } = {}) => {
      const s = stateRef.current
      const song = s.songs[index]
      const activeId = activeDeckRef.current
      const idleId = otherDeck(activeId)
      const active = getDeck(activeId)
      const idle = getDeck(idleId)
      if (!song || !active || !idle) return

      // Drain the first occurrence of this song from the user queue (if any).
      // Lets the queue UI stay unique on play even when the song was in there.
      consumeQueueSong(song.id)

      // Make sure metadata (and the canonical duration that comes with
      // it) is loading for this song. Cached after first play, so this
      // is a no-op on revisits. When it resolves, re-dispatch duration
      // if the user is still on this song — first plays often see the
      // (estimated) audio.duration first, then upgrade to the exact
      // tag duration once metadata parses.
      void ensureTrackMetadata(song.id, song.modifiedTime).then((meta) => {
        if (
          meta.duration &&
          stateRef.current.currentIndex !== null &&
          stateRef.current.songs[stateRef.current.currentIndex]?.id === song.id
        ) {
          dispatch({ type: "DURATION", duration: meta.duration })
        }
      })

      const newSrc = streamUrl(song.id)
      const sameSong = s.currentIndex === index
      const wasPlaying = !active.paused
      const wantsCrossfade = Boolean(opts.crossfade) && wasPlaying && !sameSong

      crossfadeArmedRef.current = false
      prefetchedIdRef.current = null

      if (sameSong) {
        cancelFades()
        active.currentTime = 0
        active.volume = userTargetVolume()
        void active.play().catch(() => {})
        dispatch({ type: "TIME", position: 0 })
        dispatch({ type: "PLAYBACK_ERROR", message: null })
        return
      }

      if (!wantsCrossfade) {
        cancelFades()
        // Fast path: if the idle deck already has this song preloaded
        // (we prime it at 25% of the current track), swap decks instead
        // of refetching on the active deck. Critical for backgrounded
        // / locked playback — Android & iOS suspend new network fetches
        // when the page is hidden, but a deck that's already loaded
        // can play() instantly without a roundtrip.
        const idleHasSong =
          idle.src.endsWith(newSrc) ||
          (idle.currentSrc && idle.currentSrc.endsWith(newSrc))
        console.info("[player] playIndex non-crossfade", {
          newSrc,
          idleSrc: idle.src,
          idleCurrentSrc: idle.currentSrc,
          idleHasSong,
          hidden: typeof document !== "undefined" ? document.hidden : null,
        })
        if (idleHasSong) {
          activeDeckRef.current = idleId
          idle.currentTime = 0
          idle.volume = userTargetVolume()
          idle
            .play()
            .then(() => console.info("[player] idle.play resolved"))
            .catch((err) =>
              console.warn("[player] idle.play rejected", err)
            )
          active.pause()
          prefetchedIdRef.current = null
          dispatch({ type: "SET_INDEX", index })
          dispatch({ type: "TIME", position: 0 })
          // The idle deck loaded its metadata while it was inactive,
          // so handleDuration was skipped. Re-dispatch now that it's
          // the active deck — otherwise the UI keeps showing the old
          // song's duration until durationchange fires (which it
          // doesn't, for a preloaded deck whose src didn't change).
          dispatch({
            type: "DURATION",
            duration: Number.isFinite(canonicalDuration(idle))
              ? canonicalDuration(idle)
              : 0,
          })
          dispatch({ type: "PLAYBACK_ERROR", message: null })
          return
        }
        // Slow path: load on the active deck. Suppress the transient
        // pause event during src swap — without this, isPlaying briefly
        // flips to false and the OS lock-screen UI dims until play()
        // resolves.
        idle.pause()
        switchingSrcRef.current = true
        if (active.src !== window.location.origin + newSrc) {
          active.src = newSrc
        } else {
          active.currentTime = 0
        }
        active.volume = userTargetVolume()
        const playPromise = active.play().catch(() => {})
        void Promise.resolve(playPromise).finally(() => {
          switchingSrcRef.current = false
        })
        dispatch({ type: "SET_INDEX", index })
        dispatch({ type: "TIME", position: 0 })
        dispatch({ type: "PLAYBACK_ERROR", message: null })
        return
      }

      // Crossfade path: idle deck takes over as active immediately.
      cancelFades()
      const idleHasSong =
        idle.src.endsWith(newSrc) ||
        (idle.currentSrc && idle.currentSrc.endsWith(newSrc))
      if (!idleHasSong) {
        idle.src = newSrc
      }
      idle.currentTime = 0
      activeDeckRef.current = idleId

      // Always start the new deck at full target volume — no fade-in.
      // A faded ramp-in only works in the foreground (rAF), and on a
      // hidden tab a stalled fade leaves the new song silently
      // advancing while the OS suspends our audio session entirely.
      const target = userTargetVolume()
      idle.volume = target
      void idle.play().catch(() => {})

      const isHidden =
        typeof document !== "undefined" && document.hidden

      if (isHidden) {
        // Backgrounded: pause the old deck immediately. Two simultaneous
        // audio streams over a long window (the visible-path fade-out
        // setTimeout is throttled when hidden and may not fire for ages)
        // can make iOS revoke our audio session after a few transitions.
        // The brief overlap with idle.play() above is enough to keep the
        // session continuously alive across the swap.
        active.pause()
      } else {
        // Visible: smooth fade-out for the old deck via rAF.
        setFade(activeId, fadeVolume(active, 0, CROSSFADE_MS))
        void fadesRef.current[activeId]?.promise.then(() => {
          active.pause()
        })
      }

      dispatch({ type: "SET_INDEX", index })
      dispatch({ type: "TIME", position: 0 })
      // Same reason as the non-crossfade fast path — the new active
      // deck loaded its metadata silently while it was idle.
      dispatch({
        type: "DURATION",
        duration: Number.isFinite(canonicalDuration(idle))
          ? canonicalDuration(idle)
          : 0,
      })
      dispatch({ type: "PLAYBACK_ERROR", message: null })
    },
    [getDeck, userTargetVolume, cancelFades, setFade, consumeQueueSong]
  )

  const handleEnded = React.useCallback(() => {
    console.info("[player] handleEnded fired", {
      crossfadeArmed: crossfadeArmedRef.current,
      hidden: typeof document !== "undefined" ? document.hidden : null,
    })
    if (crossfadeArmedRef.current) {
      // We already fired the crossfade earlier; nothing to do.
      crossfadeArmedRef.current = false
      return
    }
    const s = stateRef.current
    if (s.repeat === "one" && s.currentIndex !== null) {
      const active = getDeck(activeDeckRef.current)
      if (active) {
        active.currentTime = 0
        void active.play().catch(() => {})
      }
      return
    }
    const advance = computeAdvance(1, true)
    if (advance) {
      playIndex(advance.index)
    } else {
      dispatch({ type: "SET_PLAYING", isPlaying: false })
    }
  }, [computeAdvance, playIndex, getDeck])

  // ---- Audio event listeners (bound to BOTH decks, gated by active) ----

  React.useEffect(() => {
    const decks: Array<[DeckId, HTMLAudioElement | null]> = [
      [0, deckARef.current],
      [1, deckBRef.current],
    ]
    const cleanups: Array<() => void> = []

    for (const [deckId, audio] of decks) {
      if (!audio) continue

      const isActive = () => activeDeckRef.current === deckId

      const handlePlay = () => {
        if (isActive()) dispatch({ type: "SET_PLAYING", isPlaying: true })
      }
      const handlePause = () => {
        if (
          isActive() &&
          !crossfadeArmedRef.current &&
          !switchingSrcRef.current
        ) {
          dispatch({ type: "SET_PLAYING", isPlaying: false })
        }
      }
      const handleTime = () => {
        if (!isActive()) return
        dispatch({ type: "TIME", position: audio.currentTime })

        // Prefer the duration parsed from the file's own tags (TLEN /
        // Xing / mvhd) over audio.duration, which the browser
        // estimates from the first frame's bitrate and gets wrong by
        // tens of seconds for tagless VBR files.
        const duration = canonicalDuration(audio)
        if (!Number.isFinite(duration) || duration <= 0) return

        // Prefetch next song onto idle deck when past PREFETCH_PROGRESS,
        // and ALSO warm the browser's HTTP cache for the next few songs
        // beyond that. Cheap on WiFi, makes auto-advance instant.
        if (
          !prefetchedIdRef.current &&
          audio.currentTime / duration >= PREFETCH_PROGRESS
        ) {
          const advance = computeAdvance(1, true)
          if (advance) {
            const nextSong = stateRef.current.songs[advance.index]
            if (nextSong) {
              const idle = getDeck(otherDeck(activeDeckRef.current))
              if (idle) {
                idle.src = streamUrl(nextSong.id)
                prefetchedIdRef.current = nextSong.id
              }
            }
          }
          warmHttpCacheForUpcoming(stateRef.current, 5)
        }

        // Auto-trigger crossfade when within the lead window.
        if (
          !crossfadeArmedRef.current &&
          stateRef.current.repeat !== "one" &&
          duration - audio.currentTime <= CROSSFADE_LEAD_SECONDS
        ) {
          const advance = computeAdvance(1, true)
          if (advance) {
            crossfadeArmedRef.current = true
            playIndex(advance.index, { crossfade: true })
          }
        }
      }
      const handleDuration = () => {
        if (isActive()) {
          const duration = canonicalDuration(audio)
          dispatch({
            type: "DURATION",
            duration: Number.isFinite(duration) ? duration : 0,
          })
        }
      }
      const handleVolume = () => {
        if (isActive() && fadesRef.current[deckId] === null) {
          // Only mirror volume when not mid-fade — otherwise the rAF ticks
          // would clobber the user's actual volume.
          dispatch({
            type: "VOLUME",
            volume: audio.volume,
            muted: audio.muted,
          })
        }
      }
      const handleEndedEvt = () => {
        if (!isActive()) return
        handleEnded()
      }
      const handleError = () => {
        if (!isActive()) return
        const err = audio.error
        if (!err) {
          dispatch({ type: "PLAYBACK_ERROR", message: "Erro de reprodução desconhecido" })
          return
        }
        const codeName =
          err.code === MediaError.MEDIA_ERR_ABORTED
            ? "interrompido"
            : err.code === MediaError.MEDIA_ERR_NETWORK
              ? "erro de rede"
              : err.code === MediaError.MEDIA_ERR_DECODE
                ? "erro de descodificação"
                : err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                  ? "formato não suportado"
                  : `código ${err.code}`
        const detail = err.message ? `${codeName} — ${err.message}` : codeName
        const s = stateRef.current
        const songName =
          s.currentIndex !== null ? s.songs[s.currentIndex]?.title : null
        console.error("[player] audio error", {
          deck: deckId,
          code: err.code,
          message: err.message,
          song: songName,
          src: audio.currentSrc,
        })
        dispatch({
          type: "PLAYBACK_ERROR",
          message: songName
            ? `Não foi possível reproduzir "${songName}": ${detail}`
            : `Reprodução falhou: ${detail}`,
        })
      }

      audio.addEventListener("play", handlePlay)
      audio.addEventListener("pause", handlePause)
      audio.addEventListener("timeupdate", handleTime)
      audio.addEventListener("loadedmetadata", handleDuration)
      audio.addEventListener("durationchange", handleDuration)
      audio.addEventListener("volumechange", handleVolume)
      audio.addEventListener("ended", handleEndedEvt)
      audio.addEventListener("error", handleError)

      cleanups.push(() => {
        audio.removeEventListener("play", handlePlay)
        audio.removeEventListener("pause", handlePause)
        audio.removeEventListener("timeupdate", handleTime)
        audio.removeEventListener("loadedmetadata", handleDuration)
        audio.removeEventListener("durationchange", handleDuration)
        audio.removeEventListener("volumechange", handleVolume)
        audio.removeEventListener("ended", handleEndedEvt)
        audio.removeEventListener("error", handleError)
      })
    }

    return () => {
      for (const fn of cleanups) fn()
    }
  }, [computeAdvance, getDeck, handleEnded, playIndex])

  // ---- Resume from background: rescue stalled fades --------------------
  // If a crossfade started just before the page got hidden, rAF was
  // suspended and the volume ramp may be stuck mid-fade (audio playing
  // at the wrong volume). When we return to the foreground, snap the
  // active deck to the user's target volume and pause the idle.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      const active = getDeck(activeDeckRef.current)
      const idle = getDeck(otherDeck(activeDeckRef.current))
      if (!active) return
      cancelFades()
      const s = stateRef.current
      const target = s.muted ? 0 : s.volume
      active.volume = target
      if (idle && !idle.paused) idle.pause()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [getDeck, cancelFades])

  // ---- Reconciliation: sync isPlaying to the audio's actual state ------
  // Some browsers (notably mobile Safari) fire `play`/`pause` events out
  // of order during src changes, which can leave the icon out of sync.
  // The same 1 s tick also drives the auto-advance crossfade — relying
  // on `timeupdate` for that fails on backgrounded tabs where the
  // event is throttled or skipped entirely. setInterval is throttled
  // to ~1 Hz when hidden but still fires, which is enough lead time
  // with CROSSFADE_LEAD_SECONDS = 6.
  React.useEffect(() => {
    const interval = setInterval(() => {
      const active = getDeck(activeDeckRef.current)
      if (!active) return
      const actuallyPlaying = !active.paused && !active.ended
      if (actuallyPlaying !== stateRef.current.isPlaying) {
        dispatch({ type: "SET_PLAYING", isPlaying: actuallyPlaying })
      }

      // Crossfade trigger that survives backgrounded throttling.
      // Fires when within CROSSFADE_LEAD_SECONDS of the reported end
      // OR when the audio has actually ended (catches VBR files where
      // audio.duration is overestimated and the song ends silently
      // before the duration math says it should).
      const duration = canonicalDuration(active)
      const endsSoon =
        Number.isFinite(duration) &&
        duration > 0 &&
        duration - active.currentTime <= CROSSFADE_LEAD_SECONDS
      if (
        !crossfadeArmedRef.current &&
        stateRef.current.repeat !== "one" &&
        ((actuallyPlaying && endsSoon) || active.ended)
      ) {
        const advance = computeAdvance(1, true)
        if (advance) {
          console.info("[player] interval-crossfade fire", {
            remaining:
              Number.isFinite(duration) && duration > 0
                ? duration - active.currentTime
                : null,
            audioEnded: active.ended,
            hidden: typeof document !== "undefined" ? document.hidden : null,
          })
          crossfadeArmedRef.current = true
          playIndex(advance.index, { crossfade: true })
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [getDeck, computeAdvance, playIndex])

  // ---- Public actions --------------------------------------------------

  const play = React.useCallback(
    (index: number, contextSongIds?: string[]) => {
      const s = stateRef.current
      const song = s.songs[index]
      if (!song) return

      // Build the natural list for this play context. If the caller
      // didn't pass one, fall back to the current library sort order.
      const natural =
        contextSongIds && contextSongIds.length > 0
          ? contextSongIds
          : s.songs.map((sg) => sg.id)

      // If shuffle is on, scramble the upcoming portion (preserving
      // the clicked song where it is). Otherwise use the natural order.
      const list = s.shuffle
        ? shufflePreservingCurrent(natural, song.id)
        : natural

      dispatch({ type: "SET_PLAYBACK_LIST", list, natural })
      playIndex(index)
    },
    [playIndex]
  )

  // Auto-play a song shared via ?song=<id> in the URL.
  React.useEffect(() => {
    if (sharedSongHandled.current || loading || songs.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get("song")
    if (!id) return
    sharedSongHandled.current = true
    const index = songs.findIndex((s) => s.id === id)
    if (index !== -1) play(index)
    const url = new URL(window.location.href)
    url.searchParams.delete("song")
    window.history.replaceState(null, "", url.pathname + (url.search || ""))
  }, [songs, loading, play])

  const toggle = React.useCallback(() => {
    const active = getDeck(activeDeckRef.current)
    const idle = getDeck(otherDeck(activeDeckRef.current))
    const s = stateRef.current
    if (!active) return
    if (s.currentIndex === null) {
      if (s.songs.length > 0) play(0)
      return
    }
    if (active.paused) {
      cancelFades()
      active.volume = userTargetVolume()
      void active.play().catch(() => {})
    } else {
      cancelFades()
      active.pause()
      // If a crossfade was in progress the idle deck is also playing — pause it too.
      idle?.pause()
    }
  }, [getDeck, play, cancelFades, userTargetVolume])

  const next = React.useCallback(() => {
    const advance = computeAdvance(1, false)
    if (advance) playIndex(advance.index)
  }, [computeAdvance, playIndex])

  const prev = React.useCallback(() => {
    const active = getDeck(activeDeckRef.current)
    if (active && active.currentTime > 3) {
      active.currentTime = 0
      return
    }
    const advance = computeAdvance(-1, false)
    if (advance) playIndex(advance.index)
  }, [computeAdvance, playIndex, getDeck])

  const seek = React.useCallback(
    (seconds: number) => {
      const active = getDeck(activeDeckRef.current)
      if (!active) return
      active.currentTime = seconds
      // A user-initiated seek invalidates the auto-crossfade arming so we
      // re-evaluate at the new position.
      crossfadeArmedRef.current = false
    },
    [getDeck]
  )

  const setVolume = React.useCallback(
    (volume: number) => {
      const v = Math.max(0, Math.min(1, volume))
      const active = getDeck(activeDeckRef.current)
      const idle = getDeck(otherDeck(activeDeckRef.current))
      if (!active) return
      cancelFades()
      active.volume = v
      if (idle && !idle.paused) idle.volume = v
      if (active.muted && v > 0) active.muted = false
      dispatch({ type: "VOLUME", volume: v, muted: active.muted })
    },
    [getDeck, cancelFades]
  )

  const toggleMute = React.useCallback(() => {
    const active = getDeck(activeDeckRef.current)
    const idle = getDeck(otherDeck(activeDeckRef.current))
    if (!active) return
    const muted = !active.muted
    active.muted = muted
    if (idle) idle.muted = muted
    dispatch({ type: "VOLUME", volume: active.volume, muted })
  }, [getDeck])

  const toggleShuffle = React.useCallback(() => {
    const s = stateRef.current
    const currentSongId =
      s.currentIndex !== null ? s.songs[s.currentIndex]?.id ?? null : null
    dispatch({ type: "TOGGLE_SHUFFLE", currentSongId })
  }, [])

  const cycleRepeat = React.useCallback(() => {
    dispatch({ type: "CYCLE_REPEAT" })
  }, [])

  const setSearch = React.useCallback((query: string) => {
    dispatch({ type: "SEARCH", query })
  }, [])

  const setSort = React.useCallback((sort: SortMode) => {
    dispatch({ type: "SET_SORT", sort })
  }, [])

  // ---- Queue actions ---------------------------------------------------

  // Each queue entry needs a stable per-occurrence key so framer-motion
  // Reorder can identify it across re-renders even when the same song
  // id is queued multiple times.
  const newKey = (): string =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)

  const queueAdd = React.useCallback((songId: string) => {
    const s = stateRef.current
    dispatch({
      type: "QUEUE_SET",
      queue: [...s.userQueue, { key: newKey(), songId }],
    })
  }, [])

  const queueAddMany = React.useCallback((songIds: string[]) => {
    if (songIds.length === 0) return
    const s = stateRef.current
    dispatch({
      type: "QUEUE_SET",
      queue: [
        ...s.userQueue,
        ...songIds.map((songId) => ({ key: newKey(), songId })),
      ],
    })
  }, [])

  const queueRemove = React.useCallback((index: number) => {
    const s = stateRef.current
    if (index < 0 || index >= s.userQueue.length) return
    dispatch({
      type: "QUEUE_SET",
      queue: [
        ...s.userQueue.slice(0, index),
        ...s.userQueue.slice(index + 1),
      ],
    })
  }, [])

  const queueMove = React.useCallback((from: number, to: number) => {
    const s = stateRef.current
    if (
      from < 0 ||
      from >= s.userQueue.length ||
      to < 0 ||
      to >= s.userQueue.length ||
      from === to
    )
      return
    const next = [...s.userQueue]
    const [moved] = next.splice(from, 1)
    if (moved !== undefined) next.splice(to, 0, moved)
    dispatch({ type: "QUEUE_SET", queue: next })
  }, [])

  // Accept either bare song ids (legacy callers) or full QueueItem
  // objects. We map ids to fresh-keyed items, but if the caller passed
  // existing items (e.g. drag reorder) we keep their stable keys so
  // the in-flight drag stays bound to the correct row.
  const queueSet = React.useCallback(
    (input: string[] | import("@/lib/types").QueueItem[]) => {
      const queue = (input as Array<string | { key: string; songId: string }>)
        .map((entry) =>
          typeof entry === "string"
            ? { key: newKey(), songId: entry }
            : entry
        )
      dispatch({ type: "QUEUE_SET", queue })
    },
    []
  )

  const queueClear = React.useCallback(() => {
    dispatch({ type: "QUEUE_SET", queue: [] })
  }, [])

  const reorderUpcoming = React.useCallback((newUpcoming: string[]) => {
    const s = stateRef.current
    const list = s.playbackList
    const currentSongId =
      s.currentIndex !== null ? s.songs[s.currentIndex]?.id ?? null : null
    if (!currentSongId) return
    const here = list.indexOf(currentSongId)
    if (here === -1) return
    const next = [...list.slice(0, here + 1), ...newUpcoming]
    dispatch({
      type: "SET_PLAYBACK_LIST",
      list: next,
      natural: s.playbackNatural,
    })
  }, [])

  const removeFromUpcoming = React.useCallback((songId: string) => {
    const s = stateRef.current
    const currentSongId =
      s.currentIndex !== null ? s.songs[s.currentIndex]?.id ?? null : null
    if (!currentSongId || songId === currentSongId) return
    const here = s.playbackList.indexOf(currentSongId)
    if (here === -1) return
    // Only drop occurrences AFTER the current song so the past stays
    // intact (matters if we ever expose history-based prev navigation).
    const next: string[] = []
    for (let i = 0; i < s.playbackList.length; i++) {
      if (i > here && s.playbackList[i] === songId) continue
      next.push(s.playbackList[i]!)
    }
    dispatch({
      type: "SET_PLAYBACK_LIST",
      list: next,
      natural: s.playbackNatural,
    })
  }, [])

  // ---- Public context value --------------------------------------------

  const value = React.useMemo<PlayerContextValue>(
    () => ({
      songs: state.songs,
      currentIndex: state.currentIndex,
      isPlaying: state.isPlaying,
      position: state.position,
      duration: state.duration,
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeat: state.repeat,
      search: state.search,
      sort: state.sort,
      loading: state.loading,
      error: state.error,
      playbackError: state.playbackError,
      userQueue: state.userQueue,
      playbackList: state.playbackList,
      play,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setSearch,
      setSort,
      reload,
      queueAdd,
      queueAddMany,
      queueRemove,
      queueMove,
      queueSet,
      queueClear,
      reorderUpcoming,
      removeFromUpcoming,
    }),
    [
      state.songs,
      state.currentIndex,
      state.isPlaying,
      state.position,
      state.duration,
      state.volume,
      state.muted,
      state.shuffle,
      state.repeat,
      state.search,
      state.sort,
      state.loading,
      state.error,
      state.playbackError,
      state.userQueue,
      state.playbackList,
      play,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setSearch,
      setSort,
      reload,
      queueAdd,
      queueAddMany,
      queueRemove,
      queueMove,
      queueSet,
      queueClear,
      reorderUpcoming,
      removeFromUpcoming,
    ]
  )

  return (
    <PlayerContext.Provider value={value}>
      <audio ref={deckARef} preload="auto" />
      <audio ref={deckBRef} preload="auto" />
      {children}
    </PlayerContext.Provider>
  )
}
