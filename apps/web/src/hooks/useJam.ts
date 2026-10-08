import * as React from "react"

import {
  JamContext,
  type JamContextValue,
} from "@/components/player/jam-context"

/** Read the current jam and start/leave it, inside `<JamProvider>`. */
export function useJam(): JamContextValue {
  const context = React.useContext(JamContext)
  if (context === null) {
    throw new Error("useJam must be used within a <JamProvider>")
  }
  return context
}
