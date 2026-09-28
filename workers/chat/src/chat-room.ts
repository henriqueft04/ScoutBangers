import { DurableObject } from "cloudflare:workers"

interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

export interface ChatMessage {
  id: string
  userId: string
  displayName: string | null
  avatarUrl: string | null
  body: string
  createdAt: string
}

interface Profile {
  displayName: string | null
  avatarUrl: string | null
  isAdmin: boolean
}

interface ConnectionState {
  userId: string
  profile: Profile
  sentTimestamps: number[]
}

type ServerEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "deleted"; id: string }
  | { type: "error"; message: string }

type ClientEvent =
  | { type: "send"; body: string }
  | { type: "delete"; id: string }

const HISTORY_LIMIT = 50
const MAX_STORED_MESSAGES = 5000
const PRUNE_SAMPLE_RATE = 0.02
const MAX_BODY_LENGTH = 500
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_MESSAGE = "Estás a enviar mensagens demasiado depressa."

interface MessageRow extends Record<string, SqlStorageValue> {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  body: string
  created_at: string
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    body: row.body,
    createdAt: row.created_at,
  }
}

/**
 * Single global chat room, reached via idFromName("global") in
 * src/index.ts. Message history lives entirely in this object's own
 * SQLite storage — never Supabase Postgres — so chat traffic adds zero
 * load to the project's already-strained database instance.
 *
 * WebSocket Hibernation (acceptWebSocket + the ping/pong auto-responder)
 * means this object costs nothing while idle: Cloudflare evicts it from
 * memory but keeps the sockets open, waking it only when a message
 * actually needs handling.
 */
export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    )
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    )
  }

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("X-User-Id")
    const token = request.headers.get("X-User-Token")
    if (!userId || !token) {
      return new Response("Unauthorized", { status: 401 })
    }

    const profile = await this.fetchProfile(userId, token)
    const { 0: client, 1: server } = new WebSocketPair()
    const state: ConnectionState = { userId, profile, sentTimestamps: [] }

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(state)
    this.send(server, { type: "history", messages: this.loadHistory() })

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const state = ws.deserializeAttachment() as ConnectionState | null
    if (!state) return

    const event = this.parseClientEvent(raw)
    if (!event) return

    if (event.type === "send") {
      this.handleSend(ws, state, event.body)
    } else if (event.type === "delete") {
      this.handleDelete(event.id, state)
    }
  }

  private parseClientEvent(raw: string | ArrayBuffer): ClientEvent | null {
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw)
      const parsed = JSON.parse(text) as Partial<ClientEvent>
      if (parsed.type === "send" && typeof parsed.body === "string") {
        return { type: "send", body: parsed.body }
      }
      if (parsed.type === "delete" && typeof parsed.id === "string") {
        return { type: "delete", id: parsed.id }
      }
      return null
    } catch {
      return null
    }
  }

  private handleSend(ws: WebSocket, state: ConnectionState, rawBody: string) {
    const body = rawBody.trim().slice(0, MAX_BODY_LENGTH)
    if (!body) return

    if (this.isRateLimited(ws, state)) {
      this.send(ws, { type: "error", message: RATE_LIMIT_MESSAGE })
      return
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      userId: state.userId,
      displayName: state.profile.displayName,
      avatarUrl: state.profile.avatarUrl,
      body,
      createdAt: new Date().toISOString(),
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user_id, display_name, avatar_url, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      message.id,
      message.userId,
      message.displayName,
      message.avatarUrl,
      message.body,
      message.createdAt
    )

    this.broadcast({ type: "message", message })
    if (Math.random() < PRUNE_SAMPLE_RATE) this.pruneOldMessages()
  }

  private handleDelete(id: string, state: ConnectionState) {
    if (!state.profile.isAdmin) return
    this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = ?`, id)
    this.broadcast({ type: "deleted", id })
  }

  /** Sliding-window rate limit, tracked per connection via the socket's
   *  own hibernation-safe attachment — no external store needed. */
  private isRateLimited(ws: WebSocket, state: ConnectionState): boolean {
    const now = Date.now()
    state.sentTimestamps = state.sentTimestamps.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    )
    if (state.sentTimestamps.length >= RATE_LIMIT_MAX) return true
    state.sentTimestamps.push(now)
    ws.serializeAttachment(state)
    return false
  }

  private async fetchProfile(userId: string, token: string): Promise<Profile> {
    const empty: Profile = {
      displayName: null,
      avatarUrl: null,
      isAdmin: false,
    }
    try {
      const res = await fetch(
        `${this.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=display_name,avatar_url,is_admin`,
        {
          headers: {
            apikey: this.env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      )
      if (!res.ok) return empty
      const rows = (await res.json()) as Array<{
        display_name: string | null
        avatar_url: string | null
        is_admin: boolean
      }>
      const row = rows[0]
      if (!row) return empty
      return {
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        isAdmin: row.is_admin,
      }
    } catch {
      return empty
    }
  }

  private loadHistory(): ChatMessage[] {
    const rows = this.ctx.storage.sql
      .exec<MessageRow>(
        `SELECT id, user_id, display_name, avatar_url, body, created_at
         FROM messages ORDER BY created_at DESC LIMIT ?`,
        HISTORY_LIMIT
      )
      .toArray()
    return rows.reverse().map(rowToMessage)
  }

  private pruneOldMessages() {
    this.ctx.storage.sql.exec(
      `DELETE FROM messages WHERE id NOT IN (
        SELECT id FROM messages ORDER BY created_at DESC LIMIT ?
      )`,
      MAX_STORED_MESSAGES
    )
  }

  private broadcast(event: ServerEvent) {
    for (const ws of this.ctx.getWebSockets()) this.send(ws, event)
  }

  private send(ws: WebSocket, event: ServerEvent) {
    ws.send(JSON.stringify(event))
  }
}
