import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@/lib/jam-protocol"

const JAM_URL: string =
  import.meta.env.VITE_JAM_URL || "wss://jam.scoutbangers.com"

/** `closed` means we gave up reconnecting. */
export type JamConnectionStatus = "connecting" | "live" | "reconnecting" | "closed"

export interface JamConnection {
  send: (message: ClientMessage) => void
  /** Estimated one-way delay to the relay, in seconds (0 until measured). */
  latencySec: () => number
  close: () => void
}

interface Handlers {
  onMessage: (message: ServerMessage) => void
  onStatus: (status: JamConnectionStatus) => void
}

const PING_MS = 25_000
/** Weight of a new round-trip sample in the running average. */
const RTT_SMOOTHING = 0.3
/** A pathological sample must not shove everyone seconds off. */
const MAX_LATENCY_SEC = 1
const MAX_ATTEMPTS = 8
const MAX_BACKOFF_MS = 15_000

/**
 * A reconnecting WebSocket to one jam room. Every (re)connect makes the
 * relay send a fresh `hello`, so a listener that dropped out — a tunnel,
 * a locked phone — catches up on its own.
 */
export function connectJam(roomId: string, handlers: Handlers): JamConnection {
  let socket: WebSocket | null = null
  let attempt = 0
  let closed = false
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let pingSentAt = 0
  let rttMs = 0

  const open = () => {
    handlers.onStatus(attempt === 0 ? "connecting" : "reconnecting")
    const ws = new WebSocket(`${JAM_URL}/room/${roomId}`)
    socket = ws

    ws.onopen = () => {
      attempt = 0
      handlers.onStatus("live")
      // The relay answers pings itself, so they time the network round trip.
      const ping = () => {
        pingSentAt = performance.now()
        ws.send("ping")
      }
      ping()
      pingTimer = setInterval(ping, PING_MS)
    }
    ws.onmessage = (event) => {
      if (event.data === "pong") {
        const sample = performance.now() - pingSentAt
        rttMs = rttMs === 0 ? sample : rttMs + RTT_SMOOTHING * (sample - rttMs)
        return
      }
      const message = parseServerMessage(event.data)
      if (message) handlers.onMessage(message)
    }
    ws.onclose = () => {
      clearInterval(pingTimer)
      if (closed || socket !== ws) return
      if (attempt >= MAX_ATTEMPTS) {
        handlers.onStatus("closed")
        return
      }
      handlers.onStatus("reconnecting")
      retryTimer = setTimeout(open, Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS))
    }
  }

  // Phones freeze sockets in the background; reconnect as soon as we're back.
  const onVisible = () => {
    if (document.visibilityState !== "visible" || closed) return
    if (socket?.readyState === WebSocket.OPEN) return
    clearTimeout(retryTimer)
    socket?.close()
    attempt = 0
    open()
  }
  document.addEventListener("visibilitychange", onVisible)
  // One tick late, so a connection that is torn down straight away — React
  // dev mode mounts, unmounts and remounts every effect — never opens a
  // socket that would be closed mid-handshake (which the browser logs as an
  // error).
  const startTimer = setTimeout(open, 0)

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
      document.removeEventListener("visibilitychange", onVisible)
      socket?.close()
    },
  }
}
