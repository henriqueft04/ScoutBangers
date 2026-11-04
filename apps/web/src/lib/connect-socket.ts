import {
  BEARER_SUBPROTOCOL_PREFIX,
  CONNECT_SUBPROTOCOL,
  parseConnectServerMessage,
  type ConnectClientMessage,
  type ConnectServerMessage,
} from "@/lib/connect-protocol"

const CONNECT_URL: string = import.meta.env.VITE_CONNECT_URL || "wss://connect.scoutbangers.com"

/** `closed` means we gave up reconnecting. */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "closed"

export interface ConnectConnection {
  send: (message: ConnectClientMessage) => void
  /** Estimated one-way delay to the relay, in seconds (0 until measured). */
  latencySec: () => number
  close: () => void
}

interface Handlers {
  /** A fresh access token, or null when signed out. Called on every (re)connect. */
  getToken: () => Promise<string | null>
  /** The socket is open and authenticated; say hello here. */
  onOpen: () => void
  onMessage: (message: ConnectServerMessage) => void
  onStatus: (status: ConnectionStatus) => void
}

const PING_MS = 25_000
/** Weight of a new round-trip sample in the running average. */
const RTT_SMOOTHING = 0.3
/** A pathological sample must not shove a device seconds off. */
const MAX_LATENCY_SEC = 1
const MAX_ATTEMPTS = 8
const MAX_BACKOFF_MS = 15_000
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
export function connectSession(handlers: Handlers): ConnectConnection {
  let socket: WebSocket | null = null
  let attempt = 0
  let closed = false
  let opening = false
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let pingSentAt = 0
  let rttMs = 0

  const scheduleRetry = () => {
    if (closed) return
    if (attempt >= MAX_ATTEMPTS) {
      handlers.onStatus("closed")
      return
    }
    handlers.onStatus("reconnecting")
    retryTimer = setTimeout(() => void open(), Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS))
  }

  const open = async () => {
    if (opening || closed) return
    opening = true
    handlers.onStatus(attempt === 0 ? "connecting" : "reconnecting")
    let token: string | null = null
    try {
      token = await handlers.getToken()
    } catch {
      /* treated like no token below */
    }
    opening = false
    if (closed) return
    if (!token) {
      // Signed out (or the session is still loading): nothing to connect as.
      scheduleRetry()
      return
    }

    const ws = new WebSocket(CONNECT_URL + "/connect", [
      CONNECT_SUBPROTOCOL,
      BEARER_SUBPROTOCOL_PREFIX + token,
    ])
    socket = ws

    ws.onopen = () => {
      attempt = 0
      handlers.onStatus("live")
      // The relay answers pings itself, so they time the network round trip.
      const ping = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        pingSentAt = performance.now()
        ws.send("ping")
      }
      ping()
      pingTimer = setInterval(ping, PING_MS)
      handlers.onOpen()
    }
    ws.onmessage = (event) => {
      if (event.data === "pong") {
        const sample = performance.now() - pingSentAt
        rttMs = rttMs === 0 ? sample : rttMs + RTT_SMOOTHING * (sample - rttMs)
        return
      }
      const message = parseConnectServerMessage(event.data)
      if (message) handlers.onMessage(message)
    }
    ws.onclose = (event) => {
      clearInterval(pingTimer)
      if (closed || socket !== ws) return
      if (event.code === CLOSE_REPLACED || event.code === CLOSE_RATE_LIMITED) {
        handlers.onStatus("closed")
        return
      }
      scheduleRetry()
    }
  }

  // Phones freeze sockets in the background; reconnect as soon as we're back.
  const revive = () => {
    if (document.visibilityState !== "visible" || closed) return
    if (socket?.readyState === WebSocket.OPEN) return
    clearTimeout(retryTimer)
    socket?.close()
    attempt = 0
    void open()
  }
  document.addEventListener("visibilitychange", revive)
  window.addEventListener("online", revive)
  window.addEventListener("pageshow", revive)
  // One tick late, so a connection that is torn down straight away — React
  // dev mode mounts, unmounts and remounts every effect — never opens a
  // socket that would be closed mid-handshake.
  const startTimer = setTimeout(() => void open(), 0)

  return {
    send: (message) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    },
    latencySec: () => Math.min(rttMs / 2000, MAX_LATENCY_SEC),
    close: () => {
      closed = true
      clearTimeout(startTimer)
      clearInterval(pingTimer)
      clearTimeout(retryTimer)
      document.removeEventListener("visibilitychange", revive)
      window.removeEventListener("online", revive)
      window.removeEventListener("pageshow", revive)
      socket?.close()
    },
  }
}
