import { DurableObject } from "cloudflare:workers"

interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

export type ShareKind = "song" | "lyric" | "playlist"

export interface SongSharePayload {
  songId: string
  title: string
  artist?: string
}

export interface LyricSharePayload {
  songId: string
  title: string
  artist?: string
  snippet: string
}

export interface PlaylistSharePayload {
  playlistId: string
  name: string
  songCount: number
}

export type SharePayload =
  | SongSharePayload
  | LyricSharePayload
  | PlaylistSharePayload

export interface ChatShare {
  kind: ShareKind
  payload: SharePayload
}

export interface ChatMessage {
  id: string
  userId: string
  displayName: string | null
  avatarUrl: string | null
  body: string
  createdAt: string
  share: ChatShare | null
}

interface Profile {
  displayName: string | null
  avatarUrl: string | null
  isAdmin: boolean
}

interface ConnectionState {
  userId: string
  profile: Profile
}

type ServerEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "deleted"; id: string }
  | { type: "error"; message: string }

type ClientEvent =
  | { type: "send"; body: string }
  | { type: "delete"; id: string }
  | { type: "share"; kind: unknown; payload: unknown; caption?: string }

const HISTORY_LIMIT = 50
const MAX_STORED_MESSAGES = 5000
const PRUNE_SAMPLE_RATE = 0.02
const MAX_BODY_LENGTH = 500
const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_MESSAGE = "Estás a enviar mensagens demasiado depressa."

// Share payloads are attacker-controlled (any connected client can send
// one), so every field is length-capped before it's trusted enough to
// store and broadcast.
const MAX_SHARE_TEXT_LENGTH = 200
const MAX_SHARE_SNIPPET_LENGTH = 300
const MAX_SHARE_ID_LENGTH = 200

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  )
}

function isOptionalString(
  value: unknown,
  maxLength: number
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= maxLength)
  )
}

/** Validates and narrows an untrusted (kind, payload) pair from a "share"
 *  client event into a trusted ChatShare, or null if it doesn't match any
 *  known shape. */
function parseSharePayload(kind: unknown, payload: unknown): ChatShare | null {
  if (typeof payload !== "object" || payload === null) return null
  const p = payload as Record<string, unknown>

  if (kind === "song") {
    if (!isNonEmptyString(p.songId, MAX_SHARE_ID_LENGTH)) return null
    if (!isNonEmptyString(p.title, MAX_SHARE_TEXT_LENGTH)) return null
    if (!isOptionalString(p.artist, MAX_SHARE_TEXT_LENGTH)) return null
    return {
      kind: "song",
      payload: { songId: p.songId, title: p.title, artist: p.artist },
    }
  }

  if (kind === "lyric") {
    if (!isNonEmptyString(p.songId, MAX_SHARE_ID_LENGTH)) return null
    if (!isNonEmptyString(p.title, MAX_SHARE_TEXT_LENGTH)) return null
    if (!isOptionalString(p.artist, MAX_SHARE_TEXT_LENGTH)) return null
    if (!isNonEmptyString(p.snippet, MAX_SHARE_SNIPPET_LENGTH)) return null
    return {
      kind: "lyric",
      payload: {
        songId: p.songId,
        title: p.title,
        artist: p.artist,
        snippet: p.snippet,
      },
    }
  }

  if (kind === "playlist") {
    if (!isNonEmptyString(p.playlistId, MAX_SHARE_ID_LENGTH)) return null
    if (!isNonEmptyString(p.name, MAX_SHARE_TEXT_LENGTH)) return null
    if (
      typeof p.songCount !== "number" ||
      !Number.isInteger(p.songCount) ||
      p.songCount < 0
    )
      return null
    return {
      kind: "playlist",
      payload: { playlistId: p.playlistId, name: p.name, songCount: p.songCount },
    }
  }

  return null
}

/** How long a profile fetched from Supabase is trusted before re-fetching.
 *  Keeps `is_admin` promotions/demotions from taking indefinitely long to
 *  apply, while still collapsing the reconnect storms below into at most
 *  one Supabase query per user per window (see fetchProfile). */
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000

interface MessageRow extends Record<string, SqlStorageValue> {
  id: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
  body: string
  created_at: string
  share_kind: string | null
  share_payload: string | null
}

interface ProfileRow extends Record<string, SqlStorageValue> {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  is_admin: number
  cached_at: string
}

function parseStoredShare(
  kind: string | null,
  payloadJson: string | null
): ChatShare | null {
  if (!kind || !payloadJson) return null
  try {
    return { kind: kind as ShareKind, payload: JSON.parse(payloadJson) }
  } catch {
    return null
  }
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    body: row.body,
    createdAt: row.created_at,
    share: parseStoredShare(row.share_kind, row.share_payload),
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
        created_at TEXT NOT NULL,
        share_kind TEXT,
        share_payload TEXT
      )`
    )
    // Additive migration for rooms created before sharing existed —
    // CREATE TABLE IF NOT EXISTS above is a no-op once the table already
    // exists, so a pre-existing `messages` table needs these columns
    // added explicitly. SQLite has no "ADD COLUMN IF NOT EXISTS", so we
    // just swallow the "duplicate column" error on repeat startups.
    for (const column of ["share_kind TEXT", "share_payload TEXT"]) {
      try {
        ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN ${column}`)
      } catch {
        // Already present.
      }
    }
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS profiles (
        user_id TEXT PRIMARY KEY,
        display_name TEXT,
        avatar_url TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0,
        cached_at TEXT NOT NULL
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
    const state: ConnectionState = { userId, profile }

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
    } else if (event.type === "share") {
      this.handleShare(ws, state, event.kind, event.payload, event.caption)
    }
  }

  private parseClientEvent(raw: string | ArrayBuffer): ClientEvent | null {
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw)
      const parsed = JSON.parse(text) as Partial<ClientEvent> &
        Record<string, unknown>
      if (parsed.type === "send" && typeof parsed.body === "string") {
        return { type: "send", body: parsed.body }
      }
      if (parsed.type === "delete" && typeof parsed.id === "string") {
        return { type: "delete", id: parsed.id }
      }
      if (parsed.type === "share") {
        return {
          type: "share",
          kind: parsed.kind,
          payload: parsed.payload,
          caption:
            typeof parsed.caption === "string" ? parsed.caption : undefined,
        }
      }
      return null
    } catch {
      return null
    }
  }

  private handleSend(ws: WebSocket, state: ConnectionState, rawBody: string) {
    const body = rawBody.trim().slice(0, MAX_BODY_LENGTH)
    if (!body) return

    if (this.isRateLimited(state.userId)) {
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
      share: null,
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user_id, display_name, avatar_url, body, created_at, share_kind, share_payload)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
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

  /** A shared song/lyric-snippet/playlist. Reuses the same message table,
   *  rate limit and broadcast path as a plain text message — the only
   *  difference is a validated `share` payload alongside the (optional)
   *  caption in `body`. */
  private handleShare(
    ws: WebSocket,
    state: ConnectionState,
    kindInput: unknown,
    payloadInput: unknown,
    captionInput: string | undefined
  ) {
    const share = parseSharePayload(kindInput, payloadInput)
    if (!share) return

    const body = (captionInput ?? "").trim().slice(0, MAX_BODY_LENGTH)

    if (this.isRateLimited(state.userId)) {
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
      share,
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user_id, display_name, avatar_url, body, created_at, share_kind, share_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      message.id,
      message.userId,
      message.displayName,
      message.avatarUrl,
      message.body,
      message.createdAt,
      share.kind,
      JSON.stringify(share.payload)
    )

    this.broadcast({ type: "message", message })
    if (Math.random() < PRUNE_SAMPLE_RATE) this.pruneOldMessages()
  }

  /** Admins can delete any message; everyone else can only delete their
   *  own. Enforced by the WHERE clause itself (not a pre-check + separate
   *  delete) so there's no window between checking ownership and deleting
   *  where the two could disagree. */
  private handleDelete(id: string, state: ConnectionState) {
    const cursor = state.profile.isAdmin
      ? this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = ?`, id)
      : this.ctx.storage.sql.exec(
          `DELETE FROM messages WHERE id = ? AND user_id = ?`,
          id,
          state.userId
        )
    if (cursor.rowsWritten === 0) return
    this.broadcast({ type: "deleted", id })
  }

  /** Sliding-window rate limit, checked against the messages table itself
   *  rather than per-connection memory — a client can't reset its budget
   *  by just reconnecting, which previously let a reconnect loop both
   *  bypass the limit and hammer Supabase via fetchProfile below on every
   *  attempt. */
  private isRateLimited(userId: string): boolean {
    const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const row = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND created_at > ?`,
        userId,
        cutoff
      )
      .toArray()[0]
    return (row?.count ?? 0) >= RATE_LIMIT_MAX
  }

  /** Profiles are cached in this DO's own SQLite storage so a reconnect
   *  (tab switch, flaky network, the client's auto-retry) hits Supabase at
   *  most once per user per PROFILE_CACHE_TTL_MS, instead of once per
   *  connection — this was the actual source of Supabase Postgres load
   *  from chat, since message history never touches Supabase at all. */
  private async fetchProfile(userId: string, token: string): Promise<Profile> {
    const cached = this.readCachedProfile(userId)
    if (cached) return cached

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
      const profile: Profile = {
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        isAdmin: row.is_admin,
      }
      this.writeCachedProfile(userId, profile)
      return profile
    } catch {
      return empty
    }
  }

  private readCachedProfile(userId: string): Profile | null {
    const row = this.ctx.storage.sql
      .exec<ProfileRow>(`SELECT * FROM profiles WHERE user_id = ?`, userId)
      .toArray()[0]
    if (!row) return null
    if (Date.now() - Date.parse(row.cached_at) > PROFILE_CACHE_TTL_MS) return null
    return {
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isAdmin: Boolean(row.is_admin),
    }
  }

  private writeCachedProfile(userId: string, profile: Profile) {
    this.ctx.storage.sql.exec(
      `INSERT INTO profiles (user_id, display_name, avatar_url, is_admin, cached_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         is_admin = excluded.is_admin,
         cached_at = excluded.cached_at`,
      userId,
      profile.displayName,
      profile.avatarUrl,
      profile.isAdmin ? 1 : 0,
      new Date().toISOString()
    )
  }

  private loadHistory(): ChatMessage[] {
    const rows = this.ctx.storage.sql
      .exec<MessageRow>(
        `SELECT id, user_id, display_name, avatar_url, body, created_at, share_kind, share_payload
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
