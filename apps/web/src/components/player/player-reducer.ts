import { shuffledIndices } from "@/lib/shuffle"
import type { PlayerState, RepeatMode, Song } from "@/lib/types"

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
  loading: true,
  error: null,
  shuffleOrder: null,
  shufflePos: 0,
}

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  off: "all",
  all: "one",
  one: "off",
}

export function playerReducer(
  state: InternalPlayerState,
  action: PlayerAction
): InternalPlayerState {
  switch (action.type) {
    case "SONGS": {
      // If the songs list shrinks past currentIndex, drop the now-stale index
      // rather than play a different song under the user.
      const currentIndex =
        state.currentIndex !== null && state.currentIndex >= action.songs.length
          ? null
          : state.currentIndex
      return {
        ...state,
        songs: action.songs,
        loading: action.loading,
        error: action.error,
        currentIndex,
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
  }
}
