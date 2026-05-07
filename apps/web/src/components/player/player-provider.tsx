import * as React from "react"

import { useSongs } from "@/hooks/useSongs"
import { streamUrl } from "@/lib/audio-url"
import { fadeVolume, type FadeHandle } from "@/lib/fade"
import { shuffledIndices } from "@/lib/shuffle"
import { getCached, setCached } from "@/lib/storage"
import { prefetchAllMetadata } from "@/lib/track-metadata"
import type { PlayerContextValue, SortMode } from "@/lib/types"

import { PlayerContext } from "./player-context"
import {
  initialPlayerState,
  playerReducer,
  type InternalPlayerState,
} from "./player-reducer"

const VOLUME_KEY = "scoutbangers:volume"
const SORT_KEY = "scoutbangers:sort"
const PREFS_TTL_MS = 365 * 24 * 60 * 60 * 1000

const VALID_SORTS: ReadonlyArray<SortMode> = ["default", "title", "artist"]

const CROSSFADE_MS = 2000
/** Trigger auto-crossfade when this many seconds remain on the current song. */
const CROSSFADE_LEAD_SECONDS = CROSSFADE_MS / 1000
/** Begin prefetching the next song's audio onto the idle deck this far in. */
const PREFETCH_PROGRESS = 0.5

interface PersistedVolume {
  volume: number
  muted: boolean
}

type DeckId = 0 | 1
const otherDeck = (deck: DeckId): DeckId => (deck === 0 ? 1 : 0)

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

  // Auto-play a song shared via ?song=<id> in the URL.
  const sharedSongHandled = React.useRef(false)
  React.useEffect(() => {
    if (sharedSongHandled.current || loading || songs.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get("song")
    if (!id) return
    sharedSongHandled.current = true
    const index = songs.findIndex((s) => s.id === id)
    if (index !== -1) dispatch({ type: "PLAY", index })
    // Remove the param from the URL without adding a history entry.
    const url = new URL(window.location.href)
    url.searchParams.delete("song")
    window.history.replaceState(null, "", url.pathname + (url.search || ""))
  }, [songs, loading])

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

  // Bulk prefetch is intentionally disabled: it stampedes Drive's API key and
  // gets us 403'd. Metadata is loaded lazily as rows scroll into view (via
  // the IntersectionObserver in SongRow), throttled by the global queue in
  // `lib/track-metadata.ts`. Search-by-artist for not-yet-seen songs will
  // populate as the user scrolls; the trade-off is acceptable for v2.
  void prefetchAllMetadata // imported but only for opt-in callers

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
    ): { index: number; shufflePos: number } | null => {
      const s = stateRef.current
      if (s.songs.length === 0) return null

      if (auto && s.repeat === "one" && s.currentIndex !== null) {
        return { index: s.currentIndex, shufflePos: s.shufflePos }
      }

      if (s.shuffle && s.shuffleOrder) {
        let pos = s.shufflePos + direction
        if (pos >= s.shuffleOrder.length) {
          if (s.repeat === "all") pos = 0
          else return null
        } else if (pos < 0) {
          pos = s.shuffleOrder.length - 1
        }
        return { index: s.shuffleOrder[pos]!, shufflePos: pos }
      }

      const current = s.currentIndex ?? -1
      let next = current + direction
      if (next >= s.songs.length) {
        if (s.repeat === "all") next = 0
        else return null
      } else if (next < 0) {
        next = s.songs.length - 1
      }
      return { index: next, shufflePos: s.shufflePos }
    },
    []
  )

  // ---- Core playback ---------------------------------------------------

  const playIndex = React.useCallback(
    (
      index: number,
      shufflePos?: number,
      opts: { crossfade?: boolean } = {}
    ) => {
      const s = stateRef.current
      const song = s.songs[index]
      const activeId = activeDeckRef.current
      const idleId = otherDeck(activeId)
      const active = getDeck(activeId)
      const idle = getDeck(idleId)
      if (!song || !active || !idle) return

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
        idle.pause()
        if (active.src !== window.location.origin + newSrc) {
          active.src = newSrc
        } else {
          active.currentTime = 0
        }
        active.volume = userTargetVolume()
        void active.play().catch(() => {})
        dispatch({ type: "SET_INDEX", index, shufflePos })
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
      idle.volume = 0
      void idle.play().catch(() => {})

      activeDeckRef.current = idleId

      const oldDeckId = activeId
      const newDeckId = idleId
      const target = userTargetVolume()
      setFade(oldDeckId, fadeVolume(active, 0, CROSSFADE_MS))
      setFade(newDeckId, fadeVolume(idle, target, CROSSFADE_MS))
      void fadesRef.current[oldDeckId]?.promise.then(() => {
        // The old deck has fully faded; stop it and free the buffer.
        active.pause()
      })

      dispatch({ type: "SET_INDEX", index, shufflePos })
      dispatch({ type: "TIME", position: 0 })
      dispatch({ type: "PLAYBACK_ERROR", message: null })
    },
    [getDeck, userTargetVolume, cancelFades, setFade]
  )

  const handleEnded = React.useCallback(() => {
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
      playIndex(advance.index, advance.shufflePos)
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
        if (isActive() && !crossfadeArmedRef.current) {
          dispatch({ type: "SET_PLAYING", isPlaying: false })
        }
      }
      const handleTime = () => {
        if (!isActive()) return
        dispatch({ type: "TIME", position: audio.currentTime })

        const duration = audio.duration
        if (!Number.isFinite(duration) || duration <= 0) return

        // Prefetch next song onto idle deck when past halfway.
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
        }

        // Auto-trigger crossfade when within 2s of the end.
        if (
          !crossfadeArmedRef.current &&
          stateRef.current.repeat !== "one" &&
          duration - audio.currentTime <= CROSSFADE_LEAD_SECONDS
        ) {
          const advance = computeAdvance(1, true)
          if (advance) {
            crossfadeArmedRef.current = true
            playIndex(advance.index, advance.shufflePos, { crossfade: true })
          }
        }
      }
      const handleDuration = () => {
        if (isActive()) {
          dispatch({
            type: "DURATION",
            duration: Number.isFinite(audio.duration) ? audio.duration : 0,
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
        if (isActive()) handleEnded()
      }
      const handleError = () => {
        if (!isActive()) return
        const err = audio.error
        if (!err) {
          dispatch({ type: "PLAYBACK_ERROR", message: "Unknown playback error" })
          return
        }
        const codeName =
          err.code === MediaError.MEDIA_ERR_ABORTED
            ? "aborted"
            : err.code === MediaError.MEDIA_ERR_NETWORK
              ? "network error"
              : err.code === MediaError.MEDIA_ERR_DECODE
                ? "decode error"
                : err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                  ? "format not supported"
                  : `code ${err.code}`
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
            ? `Couldn't play "${songName}": ${detail}`
            : `Playback failed: ${detail}`,
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

  // ---- Public actions --------------------------------------------------

  const play = React.useCallback(
    (index: number) => {
      const s = stateRef.current
      if (s.shuffle) {
        const order = shuffledIndices(s.songs.length, index)
        dispatch({ type: "SET_SHUFFLE_ORDER", order, shufflePos: 0 })
        playIndex(index, 0, { crossfade: true })
        return
      }
      playIndex(index, undefined, { crossfade: true })
    },
    [playIndex]
  )

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
    if (advance) playIndex(advance.index, advance.shufflePos, { crossfade: true })
  }, [computeAdvance, playIndex])

  const prev = React.useCallback(() => {
    const active = getDeck(activeDeckRef.current)
    if (active && active.currentTime > 3) {
      active.currentTime = 0
      return
    }
    const advance = computeAdvance(-1, false)
    if (advance) playIndex(advance.index, advance.shufflePos, { crossfade: true })
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
    dispatch({ type: "TOGGLE_SHUFFLE" })
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
