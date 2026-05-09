/**
 * A single track from the Drive folder, as returned by `/api/songs`.
 *
 * The `id` is the Drive file ID and is the only required handle the app needs
 * to stream audio (via `streamUrl(id)`).
 */
export interface Song {
  id: string
  title: string
  artist?: string
  mimeType: string
  size: number
  modifiedTime: string
}

export type RepeatMode = "off" | "all" | "one"

export type { SortMode } from "./sort"

/**
 * Snapshot of player state, exposed to consumers via {@link usePlayer}.
 *
 * NOTE: high-frequency progress fields (`position`, `duration`) are
 * NOT here — they live on a separate context to avoid re-rendering
 * every consumer of `usePlayer()` on every `timeupdate`. Read them via
 * the `usePlayerProgress()` hook.
 */
export interface PlayerState {
  songs: Song[]
  currentIndex: number | null
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  search: string
  sort: import("./sort").SortMode
  loading: boolean
  error: string | null
  /** Surfaced from the `<audio>` element's error event. Cleared on play. */
  playbackError: string | null
  /**
   * User-injected upcoming entries. Each entry has a stable `key` so
   * the list can be reordered with framer-motion's Reorder even when
   * the same song id is queued multiple times.
   */
  userQueue: QueueItem[]
  /** Active playback order (sorted/shuffled) — what next() walks through. */
  playbackList: string[]
}

export interface QueueItem {
  /** Stable UUID — unique per insertion, even across duplicate songs. */
  key: string
  /** The song to play. */
  songId: string
}

/** Imperative actions available on the player. */
export interface PlayerActions {
  /**
   * Start playing a song. `index` is into `songs`.
   * `contextSongIds` (optional) provides the surrounding playback list:
   * the songs that should follow naturally. Pass it to make next/prev
   * walk through your tab's order instead of the library's.
   */
  play: (index: number, contextSongIds?: string[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setSearch: (search: string) => void
  setSort: (sort: import("./sort").SortMode) => void
  reload: () => void
  /** Append a song to the user queue. Duplicates allowed when explicit. */
  queueAdd: (songId: string) => void
  /** Append many songs (e.g. a whole playlist) to the user queue. */
  queueAddMany: (songIds: string[]) => void
  /** Remove the entry at this position in the user queue. */
  queueRemove: (index: number) => void
  /** Move an entry from `from` to `to` within the user queue. */
  queueMove: (from: number, to: number) => void
  /**
   * Replace the user queue entirely. Accepts either bare song ids (a
   * fresh insertion gets a generated key) or existing QueueItems with
   * their stable keys (used by drag reorder so keys stay attached).
   */
  queueSet: (input: string[] | QueueItem[]) => void
  /** Empty the user queue. */
  queueClear: () => void
  /**
   * Reorder the songs that come AFTER the current one in the playback
   * list. `newUpcoming` is the new ordering of those songs only — the
   * current song and everything before it stays put.
   */
  reorderUpcoming: (newUpcoming: string[]) => void
  /**
   * Drop a song from the upcoming portion of the playback list. No-op
   * if the song isn't there or is the currently playing one.
   */
  removeFromUpcoming: (songId: string) => void
  /** Hide the playback-error banner without restarting the song. */
  clearPlaybackError: () => void
}

export type PlayerContextValue = PlayerState & PlayerActions
