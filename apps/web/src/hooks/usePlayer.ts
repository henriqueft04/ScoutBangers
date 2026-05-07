import * as React from "react"

import { PlayerContext } from "@/components/player/player-context"
import type { PlayerContextValue } from "@/lib/types"

/** Read player state and actions inside any descendant of `<PlayerProvider>`. */
export function usePlayer(): PlayerContextValue {
  const context = React.useContext(PlayerContext)
  if (context === null) {
    throw new Error("usePlayer must be used within a <PlayerProvider>")
  }
  return context
}
