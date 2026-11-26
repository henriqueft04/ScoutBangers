import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@/lib/jam-protocol"
import { connectRelay, type RelayConnection, type RelayStatus } from "@/lib/relay-socket"

const JAM_URL: string =
  import.meta.env.VITE_JAM_URL || "wss://jam.scoutbangers.com"

export type JamConnectionStatus = RelayStatus
export type JamConnection = RelayConnection<ClientMessage>

interface Handlers {
  onMessage: (message: ServerMessage) => void
  onStatus: (status: JamConnectionStatus) => void
}

/**
 * A reconnecting WebSocket to one jam room. Every (re)connect makes the
 * relay send a fresh `hello`, so a listener that dropped out — a tunnel,
 * a locked phone — catches up on its own.
 */
export function connectJam(roomId: string, handlers: Handlers): JamConnection {
  return connectRelay<ServerMessage, ClientMessage>({
    target: async () => ({ url: `${JAM_URL}/room/${roomId}` }),
    parse: parseServerMessage,
    ...handlers,
  })
}
