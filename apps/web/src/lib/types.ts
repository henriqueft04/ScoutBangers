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

/** Snapshot of player state, exposed to consumers via {@link usePlayer}. */
export interface PlayerState {
  songs: Song[]
  currentIndex: number | null
  isPlaying: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  search: string
  loading: boolean
  error: string | null
}

/** Imperative actions available on the player. */
export interface PlayerActions {
  play: (index: number) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setSearch: (search: string) => void
  reload: () => void
}

export type PlayerContextValue = PlayerState & PlayerActions
