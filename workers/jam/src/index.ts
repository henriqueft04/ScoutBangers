import { DurableObject } from "cloudflare:workers"

import {
  MAX_MEMBERS,
  ROOM_ID_PATTERN,
  isJamState,
  parseClientMessage,
  type JamMember,
  type JamState,
  type ServerMessage,
} from "../../../apps/web/src/lib/jam-protocol"

interface Env {
  JAM_ROOM: DurableObjectNamespace<JamRoom>
  ALLOWED_ORIGINS: string
}

const ROOM_PATH = /^\/room\/([a-z0-9]+)$/
const ROOM_KEY = "room"
const DEFAULT_NAME = "Convidado"
/** An empty room is forgotten this long after the last connection. */
const ROOM_TTL_MS = 60 * 60 * 1000
/** Guards against a client flooding the room; legit senders debounce well above this. */
const MIN_MESSAGE_GAP_MS = 50

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin")
  if (!origin) return false
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return false
  }
  return env.ALLOWED_ORIGINS.split(",").some((allowed) => {
    const host = allowed.trim()
    return hostname === host || hostname.endsWith(`.${host}`)
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const roomId = new URL(request.url).pathname.match(ROOM_PATH)?.[1]
    if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
      return new Response("Not found", { status: 404 })
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 })
    }
    if (!originAllowed(request, env)) {
      return new Response("Forbidden", { status: 403 })
    }
    return env.JAM_ROOM.getByName(roomId).fetch(request)
  },
}

interface StoredRoom {
  state: JamState
  /** Epoch ms at which `state.position` was accurate. */
  at: number
  /** Incremented by every applied patch; lets listeners spot a missed one. */
  rev: number
}

/**
 * One jam. Holds the latest shared state and relays *patches* between the
 * sockets connected to it. Uses the WebSocket Hibernation API, so the
 * object is evicted from memory whenever the room is quiet and costs
 * nothing while people are just listening.
 */
export class JamRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null
  private lastMessageAt = new WeakMap<WebSocket, number>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<StoredRoom>(ROOM_KEY)
      // A room saved by an older build has a state shape we no longer speak.
      this.room =
        stored && typeof stored.rev === "number" && isJamState(stored.state)
          ? stored
          : null
    })
  }

  async fetch(_request: Request): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_MEMBERS) {
      return new Response("Room full", { status: 409 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    const member: JamMember = {
      id: crypto.randomUUID().slice(0, 8),
      name: DEFAULT_NAME,
      avatar: null,
    }
    server.serializeAttachment(member)
    this.send(server, this.hello(server))
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const now = Date.now()
    if (now - (this.lastMessageAt.get(ws) ?? 0) < MIN_MESSAGE_GAP_MS) return
    this.lastMessageAt.set(ws, now)

    const msg = parseClientMessage(message)
    if (!msg) return

    switch (msg.type) {
      case "patch": {
        // Fields the patch leaves out keep their value; the playhead is
        // carried forward to now so a patch without `position` doesn't rewind.
        const next = { ...this.liveState(), ...msg.patch }
        // The first message into an empty room has to be a complete state.
        if (!isJamState(next)) return
        const room: StoredRoom = { state: next, at: now, rev: (this.room?.rev ?? 0) + 1 }
        // Persist first, cache second.
        await this.ctx.storage.put(ROOM_KEY, room)
        this.room = room
        this.send(ws, { type: "ack", rev: room.rev })
        this.broadcast({ type: "sync", rev: room.rev, patch: msg.patch }, ws)
        return
      }
      case "resync": {
        const live = this.liveState()
        // Same revision: nothing changed but the playhead, so send just that.
        this.send(
          ws,
          live && this.room && msg.rev === this.room.rev
            ? {
                type: "tick",
                rev: this.room.rev,
                songId: live.songId,
                position: live.position,
                playing: live.playing,
              }
            : this.hello(ws)
        )
        return
      }
      case "profile": {
        const member = this.memberOf(ws)
        ws.serializeAttachment({
          ...member,
          name: msg.name || DEFAULT_NAME,
          avatar: msg.avatar,
        })
        this.broadcast({ type: "members", members: this.members() })
        return
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    this.leave(ws, code)
  }

  webSocketError(ws: WebSocket): void {
    this.leave(ws, 1011)
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
      return
    }
    this.room = null
    await this.ctx.storage.deleteAll()
  }

  /** The stored state, with `position` advanced to now if it was playing. */
  private liveState(): JamState | null {
    if (!this.room) return null
    const { state, at } = this.room
    const elapsedSec = state.playing ? (Date.now() - at) / 1000 : 0
    return { ...state, position: state.position + elapsedSec }
  }

  private hello(ws: WebSocket): ServerMessage {
    return {
      type: "hello",
      rev: this.room?.rev ?? 0,
      state: this.liveState(),
      you: this.memberOf(ws).id,
      members: this.members(),
    }
  }

  private memberOf(ws: WebSocket): JamMember {
    return ws.deserializeAttachment() as JamMember
  }

  private members(excluding?: WebSocket): JamMember[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== excluding)
      .map((ws) => this.memberOf(ws))
  }

  private leave(ws: WebSocket, code: number): void {
    try {
      // 1005/1006 are reserved and can't be sent in a close frame.
      ws.close(code === 1005 || code === 1006 ? 1000 : code)
    } catch {
      /* already closed */
    }
    this.broadcast({ type: "members", members: this.members(ws) }, ws)
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      /* socket is closing; its close handler cleans up */
    }
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) this.send(ws, message)
    }
  }
}
