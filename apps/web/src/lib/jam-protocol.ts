/**
 * Wire protocol between the app and the jam relay (workers/jam). Kept free
 * of any DOM / app imports because the worker imports this exact file — one
 * definition, one validator, on both ends of the socket.
 *
 * The room holds one `JamState`. Listeners never resend it whole: they send
 * a `patch` with only the fields they changed, the relay merges it, numbers
 * the change (`rev`) and forwards the same patch to everyone else. A
 * listener that sees a gap in the numbers asks for the full state again.
 */

const REPEAT_MODES = ["off", "all", "one"] as const
/** Same modes as the player's `RepeatMode`, spelled out to stay import-free. */
export type JamRepeat = (typeof REPEAT_MODES)[number]

export interface JamState {
  songId: string
  /** Seconds into `songId` at the moment the state was produced. */
  position: number
  playing: boolean
  shuffle: boolean
  repeat: JamRepeat
  /** The playback order being walked (already shuffled when `shuffle`). */
  order: string[]
  /**
   * The last song reached by walking `order` — the anchor "next" counts
   * from. Differs from `songId` while a queued song is playing.
   */
  cursor: string
  /** Songs a listener queued explicitly; they play before `order` continues. */
  queue: JamQueueEntry[]
}

/** A song somebody queued, and who. */
export interface JamQueueEntry {
  id: string
  /** Display name of who queued it. */
  by: string | null
}

export type JamPatch = Partial<JamState>

export interface JamMember {
  id: string
  name: string
  avatar: string | null
}

export type ClientMessage =
  | { type: "patch"; patch: JamPatch }
  | { type: "profile"; name: string; avatar: string | null }
  /**
   * "Where is everyone?" — sent on return from the background, and
   * periodically. `rev` is the last revision this listener has seen.
   */
  | { type: "resync"; rev: number }

export type ServerMessage =
  /** The full live state: on every (re)connect, and as the reply to `resync`. */
  | {
      type: "hello"
      rev: number
      state: JamState | null
      /** Which of `members` is the receiving socket. */
      you: string
      members: JamMember[]
    }
  /** Somebody else changed the state. `rev` is always the previous one + 1. */
  | { type: "sync"; rev: number; patch: JamPatch }
  /** The relay applied your patch as revision `rev`. */
  | { type: "ack"; rev: number }
  /**
   * The reply to a `resync` whose `rev` is current: nothing but the
   * live playhead, so a periodic drift check costs ~100 bytes, not the
   * whole state.
   */
  | { type: "tick"; rev: number; songId: string; position: number; playing: boolean }
  | { type: "members"; members: JamMember[] }

/** Songs a listener can queue explicitly. */
export const MAX_QUEUE = 500
/** Songs in the shared playback order; a bigger library is windowed. */
export const MAX_ORDER = 2000
export const MAX_MEMBERS = 10
export const ROOM_ID_LENGTH = 10
export const ROOM_ID_PATTERN = new RegExp(`^[a-z0-9]{${ROOM_ID_LENGTH}}$`)
/** A full-library `order` plus a long, attributed queue is ~120 KB; anything bigger isn't ours. */
export const MAX_MESSAGE_CHARS = 192 * 1024

export const MAX_NAME_CHARS = 40
const MAX_AVATAR_CHARS = 300
const SONG_ID_PATTERN = /^[\w-]{1,64}$/
const AVATAR_PATTERN = /^https:\/\/\S+$/
const MAX_POSITION_SEC = 24 * 60 * 60

const isSongId = (value: unknown): value is string =>
  typeof value === "string" && SONG_ID_PATTERN.test(value)

const isSongIds = (max: number) => (value: unknown) =>
  Array.isArray(value) && value.length <= max && value.every(isSongId)

const isQueueEntries = (value: unknown) =>
  Array.isArray(value) &&
  value.length <= MAX_QUEUE &&
  value.every(
    (entry) =>
      isRecord(entry) &&
      isSongId(entry.id) &&
      (entry.by === null ||
        (typeof entry.by === "string" && entry.by.length <= MAX_NAME_CHARS))
  )

/** One validator per field: a state needs all of them, a patch any of them. */
const FIELD_VALIDATORS: Record<keyof JamState, (value: unknown) => boolean> = {
  songId: isSongId,
  position: (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_POSITION_SEC,
  playing: (value) => typeof value === "boolean",
  shuffle: (value) => typeof value === "boolean",
  repeat: (value) => REPEAT_MODES.includes(value as JamRepeat),
  order: isSongIds(MAX_ORDER),
  cursor: isSongId,
  queue: isQueueEntries,
}

export const JAM_STATE_KEYS = Object.keys(FIELD_VALIDATORS) as (keyof JamState)[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export function isJamState(value: unknown): value is JamState {
  return (
    isRecord(value) &&
    JAM_STATE_KEYS.every((key) => FIELD_VALIDATORS[key](value[key]))
  )
}

export function isJamPatch(value: unknown): value is JamPatch {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every(
      (key) =>
        key in FIELD_VALIDATORS &&
        FIELD_VALIDATORS[key as keyof JamState](value[key])
    )
  )
}

const isMember = (value: unknown): value is JamMember =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  (value.avatar === null || typeof value.avatar === "string")

const isMembers = (value: unknown): value is JamMember[] =>
  Array.isArray(value) && value.every(isMember)

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_CHARS) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const msg = parseJson(raw)
  if (!msg) return null
  if (msg.type === "patch" && isJamPatch(msg.patch)) {
    return { type: "patch", patch: msg.patch }
  }
  if (msg.type === "profile" && typeof msg.name === "string") {
    // Free-form text from a stranger: clean it here rather than at each use.
    const avatar =
      typeof msg.avatar === "string" &&
      msg.avatar.length <= MAX_AVATAR_CHARS &&
      AVATAR_PATTERN.test(msg.avatar)
        ? msg.avatar
        : null
    return { type: "profile", name: msg.name.trim().slice(0, MAX_NAME_CHARS), avatar }
  }
  if (msg.type === "resync" && typeof msg.rev === "number") {
    return { type: "resync", rev: msg.rev }
  }
  return null
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  const msg = parseJson(raw)
  if (!msg) return null
  if (
    msg.type === "hello" &&
    typeof msg.rev === "number" &&
    typeof msg.you === "string" &&
    isMembers(msg.members) &&
    (msg.state === null || isJamState(msg.state))
  ) {
    return {
      type: "hello",
      rev: msg.rev,
      state: msg.state,
      you: msg.you,
      members: msg.members,
    }
  }
  if (msg.type === "sync" && typeof msg.rev === "number" && isJamPatch(msg.patch)) {
    return { type: "sync", rev: msg.rev, patch: msg.patch }
  }
  if (
    msg.type === "tick" &&
    typeof msg.rev === "number" &&
    FIELD_VALIDATORS.songId(msg.songId) &&
    FIELD_VALIDATORS.position(msg.position) &&
    typeof msg.playing === "boolean"
  ) {
    return {
      type: "tick",
      rev: msg.rev,
      songId: msg.songId as string,
      position: msg.position as number,
      playing: msg.playing,
    }
  }
  if (msg.type === "ack" && typeof msg.rev === "number") {
    return { type: "ack", rev: msg.rev }
  }
  if (msg.type === "members" && isMembers(msg.members)) {
    return { type: "members", members: msg.members }
  }
  return null
}
