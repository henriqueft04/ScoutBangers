import * as React from "react"

import type { JamMember } from "@/lib/jam-protocol"
import type { JamConnectionStatus } from "@/lib/jam-socket"

export interface JamInfo {
  status: JamConnectionStatus
  /** Everyone connected to the room, including this device. */
  members: JamMember[]
  /** Which of `members` is this device (`null` until connected). */
  you: string | null
}

export interface JamContextValue extends Omit<JamInfo, "status"> {
  /** `idle` while not in a jam. */
  status: "idle" | JamConnectionStatus
  roomId: string | null
  /** Opens a new room and joins it. Returns its id, to build the invite. */
  start: () => string
  leave: () => void
}

export const JamContext = React.createContext<JamContextValue | null>(null)
