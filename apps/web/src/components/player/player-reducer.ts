import { shufflePreservingCurrent } from "@/lib/shuffle"
import { sortSongs } from "@/lib/sort"
import type {
  PlayerState,
  QueueItem,
  RepeatMode,
  Song,
  SortMode,
} from "@/lib/types"

/**
 * State held by the player reducer. Extends the public {@link PlayerState}
 * with two private fields used to implement shuffle:
 *   - `shuffleOrder`: indices into `songs` in randomised order
 *   - `shufflePos`:   pointer into `shuffleOrder` for the active song
 */
export interface InternalPlayerState extends PlayerState {
  /**
   * Current playback position in seconds. Kept in the reducer so the
   * persistence effect that resumes-on-reload can read it, but NOT
   * surfaced via the main PlayerContextValue — high-frequency
   * updates would re-render every consumer of `usePlayer()`.
   * Components that need it read from `usePlayerProgress()` instead,
   * which is fed from the parallel PlayerProgressContext.
   */
  position: number
  /** Total duration of the current song in seconds. */
  duration: number
  /**
   * Current ordered list of song IDs being played through. When a user
   * clicks a song from a list (library, top-10, playlist), that list's
   * IDs become the playbackList. When shuffle toggles, this list is
   * re-shuffled in-place (keeping the current song at its position).
   */
  playbackList: string[]
  /**
   * The un-shuffled natural order of the current context. Kept around
   * so toggling shuffle off restores the original sequence.
   */
  playbackNatural: string[]
  /** User-injected upcoming queue entries. Drained before falling
   *  through to the playbackList order. Keyed entries (not bare ids)
   *  so duplicates can be reordered with framer-motion's Reorder. */
  userQueue: QueueItem[]
}

export type PlayerAction =
  | { type: "SONGS"; songs: Song[]; loading: boolean; error: string | null }
  | { type: "SET_INDEX"; index: number }
  | {
      type: "SET_PLAYBACK_LIST"
      list: string[]
      natural: string[]
    }
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | { type: "TIME"; position: number }
  | { type: "DURATION"; duration: number }
  | { type: "VOLUME"; volume: number; muted: boolean }
  | { type: "TOGGLE_SHUFFLE"; currentSongId: string | null }
  | { type: "CYCLE_REPEAT" }
  | { type: "SEARCH"; query: string }
  | { type: "SET_SORT"; sort: SortMode }
  | { type: "PLAYBACK_ERROR"; message: string | null }
  | { type: "QUEUE_SET"; queue: QueueItem[] }

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
  playbackList: [],
  playbackNatural: [],
  userQueue: [],
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
  let playingId: string | null = null
  if (currentIndex !== null) {
    playingId = state.songs[currentIndex]?.id ?? null
    if (playingId) {
      const newIdx = sorted.findIndex((s) => s.id === playingId)
      currentIndex = newIdx === -1 ? null : newIdx
    } else {
      currentIndex = null
    }
  }

  // Re-derive the playback list/natural to match the new sort, unless a
  // non-default playback list is currently set (i.e. the user started
  // from a non-library context like a playlist or top-10). We detect
  // that by comparing the natural list to the prior sorted song ids.
  const allIdsSorted = sorted.map((s) => s.id)
  const wasFromLibraryContext =
    state.playbackNatural.length === 0 ||
    state.playbackNatural.length === state.songs.length

  const playbackNatural = wasFromLibraryContext
    ? allIdsSorted
    : state.playbackNatural
  const playbackList = wasFromLibraryContext
    ? allIdsSorted
    : state.playbackList

  return {
    ...state,
    songs: sorted,
    currentIndex,
    sort,
    playbackNatural,
    playbackList,
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
      return { ...state, currentIndex: action.index }
    case "SET_PLAYBACK_LIST":
      return {
        ...state,
        playbackList: action.list,
        playbackNatural: action.natural,
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
      const currentSongId = action.currentSongId
      if (shuffle) {
        // Shuffle the natural list, but pin the current song to its
        // position so it doesn't jump while playing. Songs after current
        // in the new shuffled order become the upcoming queue.
        const list = shufflePreservingCurrent(
          state.playbackNatural,
          currentSongId
        )
        return { ...state, shuffle, playbackList: list }
      }
      // Un-shuffle: restore natural order.
      return {
        ...state,
        shuffle,
        playbackList: state.playbackNatural,
      }
    }
    case "CYCLE_REPEAT":
      return { ...state, repeat: REPEAT_CYCLE[state.repeat] }
    case "SEARCH":
      return { ...state, search: action.query }
    case "SET_SORT":
      return applySort(state, state.songs, action.sort)
    case "PLAYBACK_ERROR":
      // Setting an error implicitly pauses; clearing it (message=null)
      // doesn't touch playback — used by the dismiss button.
      return action.message
        ? { ...state, playbackError: action.message, isPlaying: false }
        : { ...state, playbackError: null }
    case "QUEUE_SET":
      return { ...state, userQueue: action.queue }
  }
}
