import * as React from "react"

import type { ConnectCommand, ConnectDevice, ConnectState } from "@/lib/connect-protocol"
import type { ConnectionStatus } from "@/lib/connect-socket"

export interface ConnectContextValue {
  /** `idle` while signed out, in a jam, or without Supabase. */
  status: "idle" | ConnectionStatus
  /** Every device of this account that is connected, including this one. */
  devices: ConnectDevice[]
  /** Which of `devices` is this one (`null` until connected). */
  you: string | null
  /** The device making sound, or `null` when the session is parked. */
  activeId: string | null
  /**
   * Another device is making sound and this one is a remote control: the
   * player context is serving *its* state, and this device is silent.
   */
  outputElsewhere: boolean
  /** Name of the device playing, when it is not this one. */
  activeName: string | null
  /** Make `deviceId` the one that plays. Passing `you` is "play here". */
  transferTo: (deviceId: string) => void
}

/** What the engine (the socket and sync logic) reports up to the provider. */
export interface ConnectInfo {
  status: "idle" | ConnectionStatus
  devices: ConnectDevice[]
  you: string | null
  activeId: string | null
  /** The session's state as far as this device knows. */
  remote: ConnectState | null
  /** Epoch ms at which `remote.position` was accurate. */
  at: number
}

export const IDLE_INFO: ConnectInfo = {
  status: "idle",
  devices: [],
  you: null,
  activeId: null,
  remote: null,
  at: 0,
}

/** What the engine lets the provider do: control the session from here. */
export interface ConnectControls {
  /** Ask the active device to do something (and show the result at once). */
  command: (command: ConnectCommand) => void
  transferTo: (deviceId: string) => void
}

export const ConnectContext = React.createContext<ConnectContextValue | null>(null)
