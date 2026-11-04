import * as React from "react"

import { ConnectContext, type ConnectContextValue } from "@/components/player/connect-context"

const IDLE: ConnectContextValue = {
  status: "idle",
  devices: [],
  you: null,
  activeId: null,
  outputElsewhere: false,
  activeName: null,
  transferTo: () => undefined,
}

/**
 * The account's devices and which one is playing. Outside a
 * `<ConnectProvider>` it reads as idle rather than throwing, so hooks that
 * only need to know "is this device the one making sound?" can use it freely.
 */
export function useConnect(): ConnectContextValue {
  return React.useContext(ConnectContext) ?? IDLE
}
