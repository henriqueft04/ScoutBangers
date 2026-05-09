import * as React from "react"

import {
  PlayerProgressContext,
  type PlayerProgress,
} from "@/components/player/player-context"

/**
 * Subscribe to the player's high-frequency progress fields
 * (position + duration). Use this instead of `usePlayer()` when a
 * component only needs to react to playback time updates — it
 * avoids the full re-render storm that happens on every
 * `timeupdate` for components that read from the main player
 * context.
 */
export function usePlayerProgress(): PlayerProgress {
  return React.useContext(PlayerProgressContext)
}
