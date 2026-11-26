/**
 * A reconnecting WebSocket to one of our relays (jam, connect): backoff,
 * keepalive pings that double as a latency estimate, and a revive when the
 * app returns from the background. The relay-specific parts — where to
 * connect and how to read a message — are passed in.
 */

/** `closed` means we gave up reconnecting. */
export type RelayStatus = "connecting" | "live" | "reconnecting" | "closed"

export interface RelayConnection<Out> {
  send: (message: Out) => void
  /** Estimated one-way delay to the relay, in seconds (0 until measured). */
  latencySec: () => number
  close: () => void
}

export interface RelayTarget {
  url: string
  protocols?: string[]
}

export interface RelayOptions<In> {
  /**
   * Where to connect, asked on every (re)connect so a token can be fresh.
   * `null` means there is nothing to connect as yet: try again later.
   */
  target: () => Promise<RelayTarget | null>
  parse: (raw: unknown) => In | null
  onMessage: (message: In) => void
  onStatus: (status: RelayStatus) => void
  /** The socket is open; say hello here. */
  onOpen?: () => void
  /** Close codes after which reconnecting would only repeat the problem. */
  stopCodes?: readonly number[]
}

const PING_MS = 25_000
/** Weight of a new round-trip sample in the running average. */
const RTT_SMOOTHING = 0.3
/** A pathological sample must not shove everyone seconds off. */
const MAX_LATENCY_SEC = 1
const MAX_ATTEMPTS = 8
const MAX_BACKOFF_MS = 15_000

export function connectRelay<In, Out>(options: RelayOptions<In>): RelayConnection<Out> {
  const { target, parse, onMessage, onStatus, onOpen, stopCodes = [] } = options
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
      onStatus("closed")
      return
    }
    onStatus("reconnecting")
    retryTimer = setTimeout(() => void open(), Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS))
  }

  const open = async () => {
    if (opening || closed) return
    opening = true
    onStatus(attempt === 0 ? "connecting" : "reconnecting")
    let where: RelayTarget | null = null
    try {
      where = await target()
    } catch {
      /* treated like no target below */
    }
    opening = false
    if (closed) return
    if (!where) {
      scheduleRetry()
      return
    }

    const ws = new WebSocket(where.url, where.protocols)
    socket = ws

    ws.onopen = () => {
      attempt = 0
      onStatus("live")
      // The relay answers pings itself, so they time the network round trip.
      const ping = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        pingSentAt = performance.now()
        ws.send("ping")
      }
      ping()
      pingTimer = setInterval(ping, PING_MS)
      onOpen?.()
    }
    ws.onmessage = (event) => {
      if (event.data === "pong") {
        const sample = performance.now() - pingSentAt
        rttMs = rttMs === 0 ? sample : rttMs + RTT_SMOOTHING * (sample - rttMs)
        return
      }
      const message = parse(event.data)
      if (message) onMessage(message)
    }
    ws.onclose = (event) => {
      clearInterval(pingTimer)
      if (closed || socket !== ws) return
      if (stopCodes.includes(event.code)) {
        onStatus("closed")
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
  // socket that would be closed mid-handshake (which the browser logs as an
  // error).
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
