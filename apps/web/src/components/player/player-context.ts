import * as React from "react"

import type { PlayerContextValue } from "@/lib/types"

export const PlayerContext = React.createContext<PlayerContextValue | null>(
  null
)
