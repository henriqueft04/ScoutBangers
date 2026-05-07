import { shuffledIndices } from "@/lib/shuffle"
import { sortSongs } from "@/lib/sort"
import type { PlayerState, RepeatMode, Song, SortMode } from "@/lib/types"

/**
 * State held by the player reducer. Extends the public {@link PlayerState}
 * with two private fields used to implement shuffle:
 *   - `shuffleOrder`: indices into `songs` in randomised order
 *   - `shufflePos`:   pointer into `shuffleOrder` for the active song
 */
export interface InternalPlayerState extends PlayerState {
  shuffleOrder: number[] | null
  shufflePos: number
}

export type PlayerAction =
  | { type: "SONGS"; songs: Song[]; loading: boolean; error: string | null }
  | { type: "SET_INDEX"; index: number; shufflePos?: number }
  | { type: "SET_SHUFFLE_ORDER"; order: number[]; shufflePos: number }
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | { type: "TIME"; position: number }
  | { type: "DURATION"; duration: number }
  | { type: "VOLUME"; volume: number; muted: boolean }
  | { type: "TOGGLE_SHUFFLE" }
  | { type: "CYCLE_REPEAT" }
  | { type: "SEARCH"; query: string }
  | { type: "SET_SORT"; sort: SortMode }
  | { type: "PLAYBACK_ERROR"; message: string | null }

export const initialPlayerState: InternalPlayerState = {
  songs: [],
  currentIndex: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
  search: "",
  sort: "default",
  loading: true,
  error: null,
  playbackError: null,
  shuffleOrder: null,
  shufflePos: 0,
}

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  off: "all",
  all: "one",
  one: "off",
}

/**
 * Reapply the current sort + bookkeeping after the songs array changes
 * (manifest refresh, sort change). Preserves which song is currently playing
 * by id, drops a stale shuffleOrder if shuffle is on.
 */
function applySort(
  state: InternalPlayerState,
  rawSongs: Song[],
  sort: SortMode
): InternalPlayerState {
  const sorted = sortSongs(rawSongs, sort)

  // Track the currently-playing song through the re-order.
  let currentIndex = state.currentIndex
  if (currentIndex !== null) {
    const playingId = state.songs[currentIndex]?.id
    if (playingId) {
      const newIdx = sorted.findIndex((s) => s.id === playingId)
      currentIndex = newIdx === -1 ? null : newIdx
    } else {
      currentIndex = null
    }
  }

  // Shuffle order is index-based; invalidate if it exists. The provider will
  // re-seed on next interaction.
  const shuffleOrder = state.shuffle
    ? Array.from({ length: sorted.length }, (_, i) => i)
    : null
  const shufflePos =
    state.shuffle && currentIndex !== null ? currentIndex : 0

  return {
    ...state,
    songs: sorted,
    currentIndex,
    sort,
    shuffleOrder,
    shufflePos,
  }
}

export function playerReducer(
  state: InternalPlayerState,
  action: PlayerAction
): InternalPlayerState {
  switch (action.type) {
    case "SONGS": {
      const rebased = applySort(state, action.songs, state.sort)
      return {
        ...rebased,
        loading: action.loading,
        error: action.error,
      }
    }
    case "SET_INDEX":
      return {
        ...state,
        currentIndex: action.index,
        shufflePos: action.shufflePos ?? state.shufflePos,
      }
    case "SET_SHUFFLE_ORDER":
      return {
        ...state,
        shuffleOrder: action.order,
        shufflePos: action.shufflePos,
      }
    case "SET_PLAYING":
      return { ...state, isPlaying: action.isPlaying }
    case "TIME":
      return { ...state, position: action.position }
    case "DURATION":
      return { ...state, duration: action.duration }
    case "VOLUME":
      return { ...state, volume: action.volume, muted: action.muted }
    case "TOGGLE_SHUFFLE": {
      const shuffle = !state.shuffle
      if (shuffle) {
        const seed = state.currentIndex ?? undefined
        return {
          ...state,
          shuffle,
          shuffleOrder: shuffledIndices(state.songs.length, seed),
          shufflePos: 0,
        }
      }
      return { ...state, shuffle, shuffleOrder: null, shufflePos: 0 }
    }
    case "CYCLE_REPEAT":
      return { ...state, repeat: REPEAT_CYCLE[state.repeat] }
    case "SEARCH":
      return { ...state, search: action.query }
    case "SET_SORT":
      return applySort(state, state.songs, action.sort)
    case "PLAYBACK_ERROR":
      return { ...state, playbackError: action.message, isPlaying: false }
  }
}
