import {
  BEARER_SUBPROTOCOL_PREFIX,
  CONNECT_SUBPROTOCOL,
  parseConnectServerMessage,
  type ConnectClientMessage,
  type ConnectServerMessage,
} from "@/lib/connect-protocol"
import { connectRelay, type RelayConnection, type RelayStatus } from "@/lib/relay-socket"

const CONNECT_URL: string = import.meta.env.VITE_CONNECT_URL || "wss://connect.scoutbangers.com"

export type ConnectionStatus = RelayStatus
export type ConnectConnection = RelayConnection<ConnectClientMessage>

interface Handlers {
  /** A fresh access token, or null when signed out. Called on every (re)connect. */
  getToken: () => Promise<string | null>
  /** The socket is open and authenticated; say hello here. */
  onOpen: () => void
  onMessage: (message: ConnectServerMessage) => void
  onStatus: (status: ConnectionStatus) => void
}

/** Another tab of this device took over; it is the one that stays. */
const CLOSE_REPLACED = 4000
/** The relay hung up on us for flooding it: reconnecting at once would repeat it. */
const CLOSE_RATE_LIMITED = 4008

/**
 * A reconnecting WebSocket to the account's session on the relay. The access
 * token travels as a WebSocket subprotocol, never in the URL, and is fetched
 * fresh on every attempt so a token that expired while the phone slept
 * doesn't strand the device. Every (re)connect ends with `onOpen`, where the
 * caller says hello and gets the full state back.
 */
export function connectSession({ getToken, ...handlers }: Handlers): ConnectConnection {
  return connectRelay<ConnectServerMessage, ConnectClientMessage>({
    target: async () => {
      // Signed out (or the session is still loading): nothing to connect as.
      const token = await getToken()
      if (!token) return null
      return {
        url: CONNECT_URL + "/connect",
        protocols: [CONNECT_SUBPROTOCOL, BEARER_SUBPROTOCOL_PREFIX + token],
      }
    },
    parse: parseConnectServerMessage,
    stopCodes: [CLOSE_REPLACED, CLOSE_RATE_LIMITED],
    ...handlers,
  })
}
