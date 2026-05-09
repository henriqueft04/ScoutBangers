import * as React from "react"

import type { PlayerContextValue } from "@/lib/types"

export const PlayerContext = React.createContext<PlayerContextValue | null>(
  null
)

/**
 * High-frequency progress fields. Split out of the main context so a
 * `timeupdate` (≈4 Hz) doesn't re-render every consumer of `usePlayer()` —
 * which means every visible song row, the library, the bottom nav, etc.
 * Only ProgressBar and useMediaSession actually need it.
 */
export interface PlayerProgress {
  position: number
  duration: number
}

export const PlayerProgressContext = React.createContext<PlayerProgress>({
  position: 0,
  duration: 0,
})
