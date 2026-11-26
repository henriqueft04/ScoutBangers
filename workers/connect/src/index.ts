import { DurableObject } from "cloudflare:workers"

import { verifyJwt } from "../../../apps/web/functions/api/_lib/jwt"
import { originAllowed } from "../../shared/origin"
import {
  BEARER_SUBPROTOCOL_PREFIX,
  CONNECT_SUBPROTOCOL,
  MAX_DEVICES,
  isConnectState,
  parseConnectClientMessage,
  type ConnectDevice,
  type ConnectLive,
  type ConnectServerMessage,
  type ConnectState,
} from "../../../apps/web/src/lib/connect-protocol"

interface Env {
  CONNECT_SESSION: DurableObjectNamespace<ConnectSession>
  ALLOWED_ORIGINS: string
  SUPABASE_URL: string
  SUPABASE_JWT_SECRET?: string
}

const SESSION_KEY = "session"
const DEFAULT_NAME = "Dispositivo"
/**
 * Message budgets, as token buckets (a burst is fine, a sustained flood is
 * not). A device's real traffic is a few messages per song change plus a
 * drag now and then; these are an order of magnitude above that. The
 * account-wide bucket exists because the free plan meters the whole Cloudflare
 * account: one signed-in user must not be able to spend everyone's quota.
 */
const SOCKET_BURST = 30
const SOCKET_PER_SEC = 6
const SESSION_BURST = 60
const SESSION_PER_SEC = 8
/** A socket this far past its budget is hostile or broken: hang up. */
const ABUSE_DROPS = 150
const CLOSE_IDENTITY_CHANGED = 4001
const CLOSE_TOKEN_EXPIRED = 4401
const CLOSE_RATE_LIMITED = 4008
/** Header the front worker sets (overwriting any client value) for the object. */
const EXP_HEADER = "X-Token-Exp"

class Bucket {
  private tokens: number
  private last = Date.now()
  constructor(
    private readonly capacity: number,
    private readonly perSec: number
  ) {
    this.tokens = capacity
  }
  take(): boolean {
    const now = Date.now()
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSec)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

/**
 * Browsers can't set headers on a WebSocket, and a token in the URL would
 * end up in logs, so the app offers it as a subprotocol:
 * `["scoutbangers.connect", "bearer.<jwt>"]`.
 */
function tokenFromSubprotocols(request: Request): string | null {
  const offered = request.headers.get("Sec-WebSocket-Protocol")
  if (!offered) return null
  const entry = offered
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(BEARER_SUBPROTOCOL_PREFIX))
  return entry ? entry.slice(BEARER_SUBPROTOCOL_PREFIX.length) : null
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/connect") {
      return new Response("Not found", { status: 404 })
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 })
    }
    if (!originAllowed(request, env.ALLOWED_ORIGINS)) {
      return new Response("Forbidden", { status: 403 })
    }
    const token = tokenFromSubprotocols(request)
    if (!token) return new Response("Unauthorized", { status: 401 })
    const verified = await verifyJwt(token, env)
    if (!verified.ok) return new Response("Unauthorized", { status: 401 })
    // The session is keyed by the verified account id, never by anything the
    // client chose, so one account can't reach another's.
    // Tell the session when this login lapses (it can't re-verify the token),
    // overwriting anything the client sent under that name.
    const headers = new Headers(request.headers)
    headers.set(EXP_HEADER, String(verified.exp))
    return env.CONNECT_SESSION.getByName(verified.sub).fetch(new Request(request, { headers }))
  },
}

interface StoredSession {
  state: ConnectState | null
  /** Epoch ms at which `state.position` was accurate. */
  at: number
  /** Incremented by every change to `state`; lets a device spot a missed one. */
  rev: number
  /** The device making sound, or null when the session is parked. */
  activeId: string | null
}

/** Set on a socket once its device has said hello; `id` is "" before that. */
interface DeviceAttachment {
  id: string
  name: string
  /** When the login that opened this socket expires, in epoch seconds. */
  exp: number
}

/**
 * One account's playback session. Holds the latest state and relays the
 * active device's patches to the others, and the others' commands to it.
 * Uses the WebSocket Hibernation API, so the object is evicted from memory
 * whenever nobody is sending and costs nothing while devices just listen.
 */
export class ConnectSession extends DurableObject<Env> {
  private session: StoredSession = { state: null, at: 0, rev: 0, activeId: null }
  private socketBudgets = new WeakMap<WebSocket, { bucket: Bucket; drops: number }>()
  private sessionBudget = new Bucket(SESSION_BURST, SESSION_PER_SEC)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<StoredSession>(SESSION_KEY)
      // A session saved by an older build has a shape we no longer speak.
      if (
        stored &&
        typeof stored.rev === "number" &&
        (stored.state === null || isConnectState(stored.state))
      ) {
        this.session = { ...stored, activeId: stored.activeId ?? null }
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const exp = Number(request.headers.get(EXP_HEADER))
    if (!Number.isFinite(exp)) return new Response("Unauthorized", { status: 401 })
    if (this.ctx.getWebSockets().length >= MAX_DEVICES * 2) {
      return new Response("Too many connections", { status: 409 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ id: "", name: DEFAULT_NAME, exp } satisfies DeviceAttachment)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": CONNECT_SUBPROTOCOL },
    })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const now = Date.now()
    const me = this.deviceOf(ws)
    // The login that opened this socket has lapsed: make the device sign in
    // again (it reconnects with a fresh token), so a revoked session can't
    // linger on an open socket.
    if (now / 1000 > me.exp) {
      ws.close(CLOSE_TOKEN_EXPIRED, "token expired")
      return
    }
    let budget = this.socketBudgets.get(ws)
    if (!budget) {
      budget = { bucket: new Bucket(SOCKET_BURST, SOCKET_PER_SEC), drops: 0 }
      this.socketBudgets.set(ws, budget)
    }
    if (!budget.bucket.take() || !this.sessionBudget.take()) {
      if (++budget.drops > ABUSE_DROPS) ws.close(CLOSE_RATE_LIMITED, "rate limited")
      return
    }

    const msg = parseConnectClientMessage(message)
    if (!msg) return

    if (msg.type === "hello") {
      this.hello(ws, msg.deviceId, msg.name || DEFAULT_NAME)
      return
    }
    // Everything else needs a device that has introduced itself.
    if (!me.id) return

    switch (msg.type) {
      case "patch": {
        // Only the active device is the source of truth.
        if (this.session.activeId !== me.id) return
        // Fields the patch leaves out keep their value; the playhead is
        // carried forward to now so a patch without `position` doesn't rewind.
        const next = { ...this.liveState(), ...msg.patch }
        // The first message into an empty session has to be a complete state.
        if (!isConnectState(next)) return
        this.session = {
          ...this.session,
          state: next,
          at: now,
          rev: this.session.rev + 1,
        }
        await this.save()
        this.broadcast({ type: "sync", rev: this.session.rev, patch: msg.patch }, ws)
        return
      }
      case "command": {
        const targets = this.socketsOf(this.session.activeId).filter((s) => s !== ws)
        if (targets.length === 0) {
          this.send(ws, { type: "unreachable" })
          return
        }
        for (const target of targets) {
          this.send(target, { type: "command", from: me.id, command: msg.command })
        }
        return
      }
      case "transfer": {
        if (this.socketsOf(msg.deviceId).length === 0) return
        if (msg.state) {
          this.session = {
            state: msg.state,
            at: now,
            rev: this.session.rev + 1,
            activeId: msg.deviceId,
          }
          await this.save()
          // The whole state changed, so everyone gets it, not just a playhead.
          for (const peer of this.helloedSockets()) this.send(peer, this.helloMessage(peer))
          return
        }
        // Freeze the playhead as of now, so the new active device resumes
        // from where the old one actually was.
        const live = this.liveState()
        this.session = {
          ...this.session,
          state: live,
          at: now,
          activeId: msg.deviceId,
        }
        await this.save()
        this.broadcast(this.devicesMessage())
        return
      }
      case "resync":
        this.send(ws, this.helloMessage(ws))
        return
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    void this.leave(ws, code)
  }

  webSocketError(ws: WebSocket): void {
    void this.leave(ws, 1011)
  }

  private hello(ws: WebSocket, id: string, name: string): void {
    // The same device reconnecting (or a second tab) replaces its old socket
    // rather than appearing twice. Close it after claiming the id, so its
    // close handler sees a live twin and doesn't treat the device as gone.
    const me = this.deviceOf(ws)
    // A socket is one device for life. Re-introducing itself as another would
    // leave the first one's id behind, possibly as the active device, with
    // nobody behind it.
    if (me.id && me.id !== id) {
      ws.close(CLOSE_IDENTITY_CHANGED, "identity changed")
      return
    }
    const previous = this.socketsOf(id).filter((s) => s !== ws)
    ws.serializeAttachment({ id, name, exp: me.exp } satisfies DeviceAttachment)
    for (const old of previous) {
      try {
        old.close(4000, "replaced")
      } catch {
        /* already closed */
      }
    }
    this.send(ws, this.helloMessage(ws))
    this.broadcast(this.devicesMessage(), ws)
  }

  private async leave(ws: WebSocket, code: number): Promise<void> {
    try {
      // 1005/1006 are reserved and can't be sent in a close frame.
      ws.close(code === 1005 || code === 1006 ? 1000 : code)
    } catch {
      /* already closed */
    }
    const { id } = this.deviceOf(ws)
    if (!id) return
    // The device has another socket open (a reconnect that raced the close).
    if (this.socketsOf(id).some((s) => s !== ws)) return

    if (this.session.activeId === id) {
      // The speaker is gone: park the session, paused where it was.
      const live = this.liveState()
      this.session = {
        state: live && { ...live, playing: false },
        at: Date.now(),
        rev: this.session.rev + 1,
        activeId: null,
      }
      await this.save()
    }
    this.broadcast(this.devicesMessage(ws), ws)
  }

  /** The stored state, with `position` advanced to now if it was playing. */
  private liveState(): ConnectState | null {
    const { state, at } = this.session
    if (!state) return null
    const elapsedSec = state.playing ? (Date.now() - at) / 1000 : 0
    return { ...state, position: state.position + elapsedSec }
  }

  private liveOf(): ConnectLive | null {
    const live = this.liveState()
    return live && { songId: live.songId, position: live.position, playing: live.playing }
  }

  private helloMessage(ws: WebSocket): ConnectServerMessage {
    return {
      type: "hello",
      rev: this.session.rev,
      state: this.liveState(),
      you: this.deviceOf(ws).id,
      devices: this.devices(),
      activeId: this.session.activeId,
    }
  }

  private devicesMessage(excluding?: WebSocket): ConnectServerMessage {
    return {
      type: "devices",
      rev: this.session.rev,
      devices: this.devices(excluding),
      activeId: this.session.activeId,
      live: this.liveOf(),
    }
  }

  private deviceOf(ws: WebSocket): DeviceAttachment {
    return ws.deserializeAttachment() as DeviceAttachment
  }

  private helloedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => this.deviceOf(ws).id)
  }

  private socketsOf(id: string | null): WebSocket[] {
    if (!id) return []
    return this.ctx.getWebSockets().filter((ws) => this.deviceOf(ws).id === id)
  }

  /** One entry per device, however many sockets it has open. */
  private devices(excluding?: WebSocket): ConnectDevice[] {
    const byId = new Map<string, ConnectDevice>()
    for (const ws of this.helloedSockets()) {
      if (ws === excluding) continue
      const { id, name } = this.deviceOf(ws)
      byId.set(id, { id, name })
    }
    return [...byId.values()]
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put(SESSION_KEY, this.session)
  }

  private send(ws: WebSocket, message: ConnectServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      /* socket is closing; its close handler cleans up */
    }
  }

  private broadcast(message: ConnectServerMessage, except?: WebSocket): void {
    for (const ws of this.helloedSockets()) {
      if (ws !== except) this.send(ws, message)
    }
  }
}
