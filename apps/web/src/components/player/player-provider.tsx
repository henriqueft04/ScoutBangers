import * as React from "react"

import { useSongs } from "@/hooks/useSongs"
import { streamUrl } from "@/lib/audio-url"
import { shuffledIndices } from "@/lib/shuffle"
import { getCached, setCached } from "@/lib/storage"
import type { PlayerContextValue } from "@/lib/types"

import { PlayerContext } from "./player-context"
import {
  initialPlayerState,
  playerReducer,
  type InternalPlayerState,
} from "./player-reducer"

const VOLUME_KEY = "scoutbangers:volume"
const VOLUME_TTL_MS = 365 * 24 * 60 * 60 * 1000

interface PersistedVolume {
  volume: number
  muted: boolean
}

/**
 * Owns the single `<audio>` element for the app and exposes player state +
 * actions via {@link PlayerContext}. Songs are sourced from {@link useSongs}
 * (stale-while-revalidate from `/api/songs`).
 *
 * The audio element is the source of truth for playback events — we mirror its
 * `play`, `pause`, `timeupdate`, `loadedmetadata`, `volumechange`, `ended`
 * events into the reducer so all React reads stay reactive.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [state, dispatch] = React.useReducer(
    playerReducer,
    initialPlayerState
  )

  // stateRef lets event handlers and async callbacks read the latest state
  // without recreating themselves on every render (and re-binding listeners).
  // We sync inside a layout effect so the ref is up-to-date before any audio
  // event fires from a paint that's already committed.
  const stateRef = React.useRef<InternalPlayerState>(state)
  React.useLayoutEffect(() => {
    stateRef.current = state
  })

  const { songs, loading, error, reload } = useSongs()

  React.useEffect(() => {
    dispatch({ type: "SONGS", songs, loading, error })
  }, [songs, loading, error])

  // ---- Volume persistence -----------------------------------------------

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const stored = getCached<PersistedVolume>(VOLUME_KEY)
    if (stored) {
      audio.volume = stored.volume
      audio.muted = stored.muted
    }
  }, [])

  React.useEffect(() => {
    setCached<PersistedVolume>(
      VOLUME_KEY,
      { volume: state.volume, muted: state.muted },
      VOLUME_TTL_MS
    )
  }, [state.volume, state.muted])

  // ---- Imperative helpers (declared before audio events use them) -------

  const playIndex = React.useCallback(
    (index: number, shufflePos?: number) => {
      const audio = audioRef.current
      const current = stateRef.current
      const song = current.songs[index]
      if (!audio || !song) return

      if (current.currentIndex !== index) {
        audio.src = streamUrl(song.id)
        dispatch({ type: "TIME", position: 0 })
      }
      dispatch({ type: "SET_INDEX", index, shufflePos })
      // Browsers may block autoplay; the play() rejection just leaves us paused.
      void audio.play().catch(() => {
        /* noop — user can press play manually */
      })
    },
    []
  )

  const computeAdvance = React.useCallback(
    (
      direction: 1 | -1,
      auto: boolean
    ): { index: number; shufflePos: number } | null => {
      const s = stateRef.current
      if (s.songs.length === 0) return null

      // Auto-advance from `ended` with repeat-one: replay current.
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

  // ---- Audio element event listeners ------------------------------------

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () =>
      dispatch({ type: "SET_PLAYING", isPlaying: true })
    const handlePause = () =>
      dispatch({ type: "SET_PLAYING", isPlaying: false })
    const handleTime = () =>
      dispatch({ type: "TIME", position: audio.currentTime })
    const handleDuration = () =>
      dispatch({
        type: "DURATION",
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      })
    const handleVolume = () =>
      dispatch({
        type: "VOLUME",
        volume: audio.volume,
        muted: audio.muted,
      })
    const handleEnded = () => {
      const s = stateRef.current
      if (s.repeat === "one" && s.currentIndex !== null) {
        audio.currentTime = 0
        void audio.play().catch(() => {})
        return
      }
      const advance = computeAdvance(1, true)
      if (advance) {
        playIndex(advance.index, advance.shufflePos)
      } else {
        dispatch({ type: "SET_PLAYING", isPlaying: false })
      }
    }

    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("timeupdate", handleTime)
    audio.addEventListener("loadedmetadata", handleDuration)
    audio.addEventListener("durationchange", handleDuration)
    audio.addEventListener("volumechange", handleVolume)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("timeupdate", handleTime)
      audio.removeEventListener("loadedmetadata", handleDuration)
      audio.removeEventListener("durationchange", handleDuration)
      audio.removeEventListener("volumechange", handleVolume)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [computeAdvance, playIndex])

  // ---- Public actions ----------------------------------------------------

  const play = React.useCallback(
    (index: number) => {
      const s = stateRef.current
      if (s.shuffle) {
        // Re-seed shuffle order so the chosen song lands at position 0.
        const order = shuffledIndices(s.songs.length, index)
        dispatch({ type: "SET_SHUFFLE_ORDER", order, shufflePos: 0 })
        playIndex(index, 0)
        return
      }
      playIndex(index)
    },
    [playIndex]
  )

  const toggle = React.useCallback(() => {
    const audio = audioRef.current
    const s = stateRef.current
    if (!audio) return
    // Nothing loaded yet — start the first song.
    if (s.currentIndex === null) {
      if (s.songs.length > 0) play(0)
      return
    }
    if (audio.paused) {
      void audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [play])

  const next = React.useCallback(() => {
    const advance = computeAdvance(1, false)
    if (advance) playIndex(advance.index, advance.shufflePos)
  }, [computeAdvance, playIndex])

  const prev = React.useCallback(() => {
    const audio = audioRef.current
    // Spotify-style: if we're past 3s, restart current song instead of going
    // back. Hardcoded 3s threshold matches Spotify and is a near-universal UX.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const advance = computeAdvance(-1, false)
    if (advance) playIndex(advance.index, advance.shufflePos)
  }, [computeAdvance, playIndex])

  const seek = React.useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
  }, [])

  const setVolume = React.useCallback((volume: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.max(0, Math.min(1, volume))
    if (audio.muted && volume > 0) audio.muted = false
  }, [])

  const toggleMute = React.useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
  }, [])

  const toggleShuffle = React.useCallback(() => {
    dispatch({ type: "TOGGLE_SHUFFLE" })
  }, [])

  const cycleRepeat = React.useCallback(() => {
    dispatch({ type: "CYCLE_REPEAT" })
  }, [])

  const setSearch = React.useCallback((query: string) => {
    dispatch({ type: "SEARCH", query })
  }, [])

  // ---- Public context value ---------------------------------------------

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
      loading: state.loading,
      error: state.error,
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
      state.loading,
      state.error,
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
      reload,
    ]
  )

  return (
    <PlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" />
      {children}
    </PlayerContext.Provider>
  )
}
